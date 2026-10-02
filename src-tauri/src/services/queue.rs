//! Download queue management service
//!
//! Responsibilities:
//! - Hold pending and started downloads and run at most `max_concurrent`
//!   at once (clamped to [`MIN_CONCURRENT`]..=[`MAX_CONCURRENT`]).
//! - Drive each download through an injectable [`Downloader`] and publish
//!   status/progress through an injectable [`EventSink`], so the state machine
//!   is testable without yt-dlp or a Tauri window.
//! - Pause / resume / cancel / retry with explicit per-run *stop intents*: a
//!   download killed because the user paused or cancelled it finishes as
//!   `Paused`/`Cancelled`, never as `Failed`.
//! - Record completed downloads in the library database.
//!
//! State lives behind a single async mutex. It is never held across a call
//! into the downloader, so pause/cancel/shutdown cannot deadlock against a
//! finishing download.

use crate::error::{ClipyError, Result};
use crate::models::download::{DownloadOptions, DownloadProgress, DownloadStatus, DownloadTask};
use crate::models::library::LibraryVideo;
use crate::services::database::{self, Database};
use crate::services::ytdlp;
use crate::utils::logger::redact_url;
use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

/// Lowest accepted concurrency; 0 would stall the queue forever.
pub const MIN_CONCURRENT: u32 = 1;
/// Highest accepted concurrency; more parallel yt-dlp processes mostly get
/// throttled by the remote site and starve the machine.
pub const MAX_CONCURRENT: u32 = 10;

/// How long pause/cancel/shutdown wait for a killed download to wind down.
const STOP_TIMEOUT: Duration = Duration::from_secs(10);

/// Boxed `Send` future, used where trait objects must return futures.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Clamp a requested concurrency into the supported range.
///
/// # Example
/// ```
/// use clipy_lib::services::queue::clamp_concurrency;
/// assert_eq!(clamp_concurrency(0), 1);
/// assert_eq!(clamp_concurrency(3), 3);
/// assert_eq!(clamp_concurrency(500), 10);
/// ```
pub fn clamp_concurrency(requested: u32) -> u32 {
    requested.clamp(MIN_CONCURRENT, MAX_CONCURRENT)
}

// -----------------------------------------------------------------------------
// Seams
// -----------------------------------------------------------------------------

/// Destination for queue events (the frontend in production).
pub trait EventSink: Send + Sync {
    /// A status or progress change for one download (`download-progress`).
    fn download_progress(&self, progress: &DownloadProgress);
    /// A completed download was added to the library (`library-updated`).
    fn library_updated(&self);
}

/// [`EventSink`] that emits Tauri events to every window.
pub struct TauriEventSink<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> TauriEventSink<R> {
    /// Emit through `app`.
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> EventSink for TauriEventSink<R> {
    fn download_progress(&self, progress: &DownloadProgress) {
        if let Err(e) = self.app.emit("download-progress", progress) {
            error!("Failed to emit progress event: {}", e);
        }
    }

    fn library_updated(&self) {
        let _ = self.app.emit("library-updated", ());
    }
}

/// Performs one download. Implementations must make `cancel` cause an
/// in-flight `download` for the same id to return promptly.
pub trait Downloader: Send + Sync {
    /// Download `url` and resolve to the final file path. Intermediate
    /// progress is sent on `progress`; the sender is dropped when done.
    fn download(
        &self,
        id: String,
        url: String,
        options: DownloadOptions,
        progress: mpsc::Sender<DownloadProgress>,
    ) -> BoxFuture<'static, Result<PathBuf>>;

    /// Stop the in-flight download for `id`, if any.
    fn cancel<'a>(&'a self, id: &'a str) -> BoxFuture<'a, ()>;
}

/// Production [`Downloader`] backed by `ytdlp::download_video` and the
/// process registry.
pub struct YtdlpDownloader {
    app: AppHandle,
}

impl YtdlpDownloader {
    /// Download through the binaries resolved from `app`.
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl Downloader for YtdlpDownloader {
    fn download(
        &self,
        id: String,
        url: String,
        options: DownloadOptions,
        progress: mpsc::Sender<DownloadProgress>,
    ) -> BoxFuture<'static, Result<PathBuf>> {
        let app = self.app.clone();
        Box::pin(async move {
            let output = options.output_path.trim();
            if !output.is_empty() {
                if let Err(e) = std::fs::create_dir_all(output) {
                    warn!("Could not create download directory {:?}: {}", output, e);
                }
            }
            let result = ytdlp::download_video(&app, id.clone(), &url, &options, progress).await;
            // NOTE: download_video only unregisters after a successful wait();
            // early-error paths would otherwise leave a stale PID that a later
            // pause/cancel could kill after the OS reused it.
            if let Some(registry) = crate::services::process_registry::get_registry() {
                registry.unregister(&id).await;
            }
            result
        })
    }

    fn cancel<'a>(&'a self, id: &'a str) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            if let Some(registry) = crate::services::process_registry::get_registry() {
                registry.kill(id).await;
            }
        })
    }
}

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

/// Why a run is being stopped; decides how its exit is interpreted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StopIntent {
    Pause,
    Cancel,
}

/// A task that has left the pending list (running, paused or terminal).
struct Entry {
    task: DownloadTask,
    /// Id of the run currently owning this entry; completions from older runs
    /// are ignored.
    run: u64,
    intent: Option<StopIntent>,
}

struct State {
    active: HashMap<String, Entry>,
    pending: VecDeque<DownloadTask>,
    handles: HashMap<String, JoinHandle<()>>,
    max_concurrent: u32,
    next_run: u64,
    shutting_down: bool,
}

impl State {
    fn running_count(&self) -> usize {
        self.active
            .values()
            .filter(|e| is_running(e.task.status))
            .count()
    }
}

fn is_running(status: DownloadStatus) -> bool {
    matches!(
        status,
        DownloadStatus::Pending
            | DownloadStatus::Fetching
            | DownloadStatus::Downloading
            | DownloadStatus::Processing
    )
}

fn is_terminal(status: DownloadStatus) -> bool {
    matches!(
        status,
        DownloadStatus::Completed | DownloadStatus::Failed | DownloadStatus::Cancelled
    )
}

fn progress_of(task: &DownloadTask, file_path: Option<String>) -> DownloadProgress {
    DownloadProgress {
        download_id: task.id.clone(),
        status: task.status,
        progress: task.progress,
        downloaded_bytes: task.downloaded_bytes,
        total_bytes: task.total_bytes,
        speed: task.speed,
        eta: task.eta,
        file_path,
    }
}

// -----------------------------------------------------------------------------
// Queue
// -----------------------------------------------------------------------------

/// Download queue state
pub struct DownloadQueue {
    state: Mutex<State>,
    sink: Arc<dyn EventSink>,
    downloader: Arc<dyn Downloader>,
    library: RwLock<Option<Arc<Database>>>,
}

impl DownloadQueue {
    /// Create a queue running at most `max_concurrent` downloads (clamped).
    pub fn new(
        sink: Arc<dyn EventSink>,
        downloader: Arc<dyn Downloader>,
        max_concurrent: u32,
    ) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(State {
                active: HashMap::new(),
                pending: VecDeque::new(),
                handles: HashMap::new(),
                max_concurrent: clamp_concurrency(max_concurrent),
                next_run: 0,
                shutting_down: false,
            }),
            sink,
            downloader,
            library: RwLock::new(None),
        })
    }

    /// Record completed downloads in `db` instead of the global database.
    pub fn set_library(&self, db: Arc<Database>) {
        *self.library.write().unwrap_or_else(|e| e.into_inner()) = Some(db);
    }

    fn emit(&self, task: &DownloadTask) {
        self.sink.download_progress(&progress_of(task, None));
    }

    /// Queue `task` and start it if a slot is free. Fails if a task with the
    /// same id is already known or the queue is shutting down.
    pub async fn add_download(self: &Arc<Self>, mut task: DownloadTask) -> Result<()> {
        info!("Adding download to queue: {}", task.title);
        let mut st = self.state.lock().await;
        if st.shutting_down {
            return Err(ClipyError::Download(
                "Download queue is shutting down".into(),
            ));
        }
        if st.active.contains_key(&task.id) {
            return Err(ClipyError::Download("Download already in progress".into()));
        }
        if st.pending.iter().any(|t| t.id == task.id) {
            return Err(ClipyError::Download("Download already in queue".into()));
        }
        task.status = DownloadStatus::Pending;
        self.emit(&task);
        st.pending.push_back(task);
        self.fill_slots(&mut st);
        Ok(())
    }

    async fn process_queue(self: &Arc<Self>) {
        let mut st = self.state.lock().await;
        self.fill_slots(&mut st);
    }

    /// Promote pending tasks while slots are free. Called after every state
    /// change that can free a slot or add work.
    fn fill_slots(self: &Arc<Self>, st: &mut State) {
        if st.shutting_down {
            return;
        }
        while st.running_count() < st.max_concurrent as usize {
            let Some(mut task) = st.pending.pop_front() else {
                break;
            };
            st.next_run += 1;
            let run = st.next_run;
            task.status = DownloadStatus::Downloading;
            info!("Starting download: {}", task.title);
            self.emit(&task);

            let id = task.id.clone();
            st.active.insert(
                id.clone(),
                Entry {
                    task: task.clone(),
                    run,
                    intent: None,
                },
            );
            // NOTE: spawned while holding the state lock, so the task cannot
            // reach finish_run before its handle is recorded below.
            let handle = tokio::spawn(self.clone().run_task(task, run));
            st.handles.insert(id, handle);
        }
    }

    async fn run_task(self: Arc<Self>, task: DownloadTask, run: u64) {
        let (progress_tx, mut progress_rx) = mpsc::channel::<DownloadProgress>(100);
        let forwarder = {
            let queue = self.clone();
            let id = task.id.clone();
            tokio::spawn(async move {
                while let Some(progress) = progress_rx.recv().await {
                    queue.apply_progress(&id, run, progress).await;
                }
            })
        };

        debug!("Download URL: {}", redact_url(&task.url));
        let result = self
            .downloader
            .download(
                task.id.clone(),
                task.url.clone(),
                task.options.clone(),
                progress_tx,
            )
            .await;
        // Drain progress first so a late "downloading 99%" can never be
        // emitted after the terminal status.
        let _ = forwarder.await;
        self.finish_run(&task.id, run, result).await;
    }

    async fn apply_progress(&self, id: &str, run: u64, progress: DownloadProgress) {
        // The queue alone decides terminal states (it must account for stop
        // intents and the library write), so terminal reports are dropped.
        if is_terminal(progress.status) || progress.status == DownloadStatus::Paused {
            return;
        }
        let mut st = self.state.lock().await;
        let Some(entry) = st.active.get_mut(id) else {
            return;
        };
        if entry.run != run || entry.intent.is_some() || !is_running(entry.task.status) {
            return;
        }
        let t = &mut entry.task;
        t.status = progress.status;
        t.progress = progress.progress;
        t.downloaded_bytes = progress.downloaded_bytes;
        t.total_bytes = progress.total_bytes;
        t.speed = progress.speed;
        t.eta = progress.eta;
        self.sink.download_progress(&progress);
    }

    async fn finish_run(self: &Arc<Self>, id: &str, run: u64, result: Result<PathBuf>) {
        let mut st = self.state.lock().await;
        let owned = st.active.get(id).is_some_and(|e| e.run == run);
        if !owned {
            debug!("Ignoring completion of superseded run {} for {}", run, id);
            self.fill_slots(&mut st);
            return;
        }
        st.handles.remove(id);
        let entry = st.active.get_mut(id).expect("checked above");
        let intent = entry.intent.take();
        let t = &mut entry.task;

        match (result, intent) {
            // A pause that raced a successful finish: the file exists, so
            // report it as done rather than forcing a pointless re-download.
            (Ok(file_path), None | Some(StopIntent::Pause)) => {
                let file_path_str = file_path.to_string_lossy().to_string();
                t.status = DownloadStatus::Completed;
                t.progress = 100.0;
                t.speed = 0;
                t.eta = 0;
                t.completed_at = Some(chrono::Utc::now().to_rfc3339());
                t.output_path = file_path_str.clone();
                info!("Download completed: {} -> {}", t.title, file_path_str);

                let file_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
                let video = LibraryVideo::new(
                    t.video_id.clone(),
                    t.title.clone(),
                    t.thumbnail.clone(),
                    t.duration,
                    t.channel.clone(),
                    file_path_str.clone(),
                    file_size,
                    t.format.clone(),
                    format!("{}p", t.quality),
                    t.url.clone(),
                );
                let progress = progress_of(t, Some(file_path_str));
                match self.record_in_library(&video) {
                    Ok(()) => self.sink.library_updated(),
                    Err(e) => error!("Failed to add video to library: {}", e),
                }
                self.sink.download_progress(&progress);
            }
            (Ok(_), Some(StopIntent::Cancel)) => {
                debug!(
                    "Download {} finished after cancel; keeping it cancelled",
                    id
                );
            }
            (Err(e), None) => {
                t.status = DownloadStatus::Failed;
                t.speed = 0;
                t.eta = 0;
                t.error = Some(e.to_string());
                error!("Download failed: {} - {}", t.title, e);
                let progress = progress_of(t, None);
                self.sink.download_progress(&progress);
            }
            (Err(_), Some(intent)) => {
                debug!("Download {} stopped ({:?})", id, intent);
            }
        }

        self.fill_slots(&mut st);
    }

    fn record_in_library(&self, video: &LibraryVideo) -> Result<()> {
        let db = self
            .library
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        match db {
            Some(db) => db.add_library_video(video),
            None => database::add_library_video(video),
        }
    }

    /// Ask the downloader to stop `id` and wait (bounded) for its run to end.
    async fn stop_run(&self, id: &str, handle: Option<JoinHandle<()>>) {
        self.downloader.cancel(id).await;
        if let Some(handle) = handle {
            if tokio::time::timeout(STOP_TIMEOUT, handle).await.is_err() {
                warn!("Download {} did not stop within {:?}", id, STOP_TIMEOUT);
            }
        }
    }

    /// Pause a download.
    ///
    /// yt-dlp has no real pause, so the process is killed and restarted on
    /// resume (it continues from its `.part` file). Pausing a pending task
    /// parks it without starting; pausing an already paused task is a no-op.
    pub async fn pause_download(self: &Arc<Self>, id: &str) -> Result<()> {
        info!("Pausing download: {}", id);
        let handle = {
            let mut st = self.state.lock().await;
            if let Some(pos) = st.pending.iter().position(|t| t.id == id) {
                let mut task = st.pending.remove(pos).expect("position is valid");
                task.status = DownloadStatus::Paused;
                self.emit(&task);
                st.active.insert(
                    id.to_string(),
                    Entry {
                        task,
                        run: 0,
                        intent: None,
                    },
                );
                return Ok(());
            }
            let entry = st
                .active
                .get_mut(id)
                .ok_or_else(|| ClipyError::Download("Download not found".into()))?;
            match entry.task.status {
                DownloadStatus::Paused => return Ok(()),
                status if is_running(status) => {
                    entry.intent = Some(StopIntent::Pause);
                    entry.task.status = DownloadStatus::Paused;
                    entry.task.speed = 0;
                    entry.task.eta = 0;
                    let task = entry.task.clone();
                    self.emit(&task);
                }
                _ => {
                    return Err(ClipyError::Download("Download is not running".into()));
                }
            }
            st.handles.remove(id)
        };
        self.stop_run(id, handle).await;
        self.process_queue().await;
        Ok(())
    }

    /// Resume a paused download. It re-enters the front of the pending list,
    /// so it only starts when a concurrency slot is free.
    pub async fn resume_download(self: &Arc<Self>, id: &str) -> Result<()> {
        info!("Resuming download: {}", id);
        let handle = {
            let mut st = self.state.lock().await;
            let paused = st
                .active
                .get(id)
                .is_some_and(|e| e.task.status == DownloadStatus::Paused);
            if !paused {
                return Err(ClipyError::Download(
                    "Download not found or not paused".into(),
                ));
            }
            let mut task = st.active.remove(id).expect("checked above").task;
            task.status = DownloadStatus::Pending;
            self.emit(&task);
            st.pending.push_front(task);
            st.handles.remove(id)
        };
        // NOTE: let any previous run finish its teardown (e.g. yt-dlp's
        // registry unregister) before a new run registers under the same id.
        if let Some(handle) = handle {
            let _ = tokio::time::timeout(STOP_TIMEOUT, handle).await;
        }
        self.process_queue().await;
        Ok(())
    }

    /// Cancel a download.
    ///
    /// Pending, running and paused tasks become `Cancelled` (and stay listed
    /// so they can be retried). Cancelling a task that already finished
    /// (completed/failed/cancelled) dismisses it from the list.
    pub async fn cancel_download(self: &Arc<Self>, id: &str) -> Result<()> {
        info!("Cancelling download: {}", id);
        let handle = {
            let mut st = self.state.lock().await;
            if let Some(pos) = st.pending.iter().position(|t| t.id == id) {
                let mut task = st.pending.remove(pos).expect("position is valid");
                task.status = DownloadStatus::Cancelled;
                self.emit(&task);
                st.active.insert(
                    id.to_string(),
                    Entry {
                        task,
                        run: 0,
                        intent: None,
                    },
                );
                return Ok(());
            }
            let entry = st
                .active
                .get_mut(id)
                .ok_or_else(|| ClipyError::Download("Download not found".into()))?;
            if is_terminal(entry.task.status) {
                st.active.remove(id);
                return Ok(());
            }
            if is_running(entry.task.status) {
                entry.intent = Some(StopIntent::Cancel);
            }
            entry.task.status = DownloadStatus::Cancelled;
            entry.task.speed = 0;
            entry.task.eta = 0;
            let task = entry.task.clone();
            self.emit(&task);
            st.handles.remove(id)
        };
        self.stop_run(id, handle).await;
        self.process_queue().await;
        Ok(())
    }

    /// Re-queue a failed or cancelled download under the same id.
    ///
    /// The id is kept because the frontend keeps its row keyed by it; a new
    /// id would orphan the row.
    pub async fn retry_download(self: &Arc<Self>, id: &str) -> Result<()> {
        info!("Retrying download: {}", id);
        let mut st = self.state.lock().await;
        let status = st
            .active
            .get(id)
            .map(|e| e.task.status)
            .ok_or_else(|| ClipyError::Download("Download not found".into()))?;
        if !matches!(status, DownloadStatus::Failed | DownloadStatus::Cancelled) {
            return Err(ClipyError::Download(
                "Download is not in a retryable state".into(),
            ));
        }
        if st.shutting_down {
            return Err(ClipyError::Download(
                "Download queue is shutting down".into(),
            ));
        }
        let mut task = st.active.remove(id).expect("checked above").task;
        task.status = DownloadStatus::Pending;
        task.progress = 0.0;
        task.downloaded_bytes = 0;
        task.total_bytes = 0;
        task.speed = 0;
        task.eta = 0;
        task.error = None;
        task.created_at = chrono::Utc::now().to_rfc3339();
        task.completed_at = None;
        self.emit(&task);
        st.pending.push_back(task);
        self.fill_slots(&mut st);
        Ok(())
    }

    /// Started tasks (oldest first) followed by pending tasks in queue order.
    pub async fn get_all_downloads(&self) -> Vec<DownloadTask> {
        let st = self.state.lock().await;
        let mut downloads = sorted_active(&st);
        downloads.extend(st.pending.iter().cloned());
        downloads
    }

    /// Started tasks (running, paused or finished), oldest first.
    pub async fn get_active_downloads(&self) -> Vec<DownloadTask> {
        sorted_active(&*self.state.lock().await)
    }

    /// Tasks waiting for a slot, in start order.
    pub async fn get_pending_downloads(&self) -> Vec<DownloadTask> {
        self.state.lock().await.pending.iter().cloned().collect()
    }

    /// Look up one task by id.
    pub async fn get_download(&self, id: &str) -> Option<DownloadTask> {
        let st = self.state.lock().await;
        st.active
            .get(id)
            .map(|e| e.task.clone())
            .or_else(|| st.pending.iter().find(|t| t.id == id).cloned())
    }

    /// Drop completed, failed and cancelled tasks from the list.
    pub async fn clear_completed(&self) {
        self.state
            .lock()
            .await
            .active
            .retain(|_, e| !is_terminal(e.task.status));
    }

    /// Current concurrency limit.
    pub async fn max_concurrent(&self) -> u32 {
        self.state.lock().await.max_concurrent
    }

    /// Set the concurrency limit (clamped) and start pending work if it grew.
    /// Lowering it never interrupts running downloads. Returns the applied value.
    pub async fn set_max_concurrent(self: &Arc<Self>, max: u32) -> u32 {
        let mut st = self.state.lock().await;
        st.max_concurrent = clamp_concurrency(max);
        let applied = st.max_concurrent;
        self.fill_slots(&mut st);
        applied
    }

    /// Stop accepting work, cancel everything pending, running or paused, and
    /// wait (bounded per download) for running downloads to exit.
    pub async fn shutdown(&self) {
        info!("Shutting down download queue");
        let to_stop: Vec<(String, Option<JoinHandle<()>>)> = {
            let mut st = self.state.lock().await;
            st.shutting_down = true;

            let pending: Vec<DownloadTask> = st.pending.drain(..).collect();
            for mut task in pending {
                task.status = DownloadStatus::Cancelled;
                self.emit(&task);
            }

            let ids: Vec<String> = st
                .active
                .iter()
                .filter(|(_, e)| !is_terminal(e.task.status))
                .map(|(id, _)| id.clone())
                .collect();
            let mut out = Vec::with_capacity(ids.len());
            for id in ids {
                let entry = st.active.get_mut(&id).expect("id collected above");
                if is_running(entry.task.status) {
                    entry.intent = Some(StopIntent::Cancel);
                }
                entry.task.status = DownloadStatus::Cancelled;
                let task = entry.task.clone();
                self.emit(&task);
                let handle = st.handles.remove(&id);
                out.push((id, handle));
            }
            out
        };

        futures_util::future::join_all(
            to_stop
                .into_iter()
                .map(|(id, handle)| async move { self.stop_run(&id, handle).await }),
        )
        .await;
        info!("Download queue shut down");
    }
}

fn sorted_active(st: &State) -> Vec<DownloadTask> {
    let mut tasks: Vec<DownloadTask> = st.active.values().map(|e| e.task.clone()).collect();
    tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(&b.id)));
    tasks
}

// -----------------------------------------------------------------------------
// Global instance
// -----------------------------------------------------------------------------

static QUEUE: RwLock<Option<Arc<DownloadQueue>>> = RwLock::new(None);

/// Create the production queue (Tauri events + yt-dlp) and install it.
pub fn init_queue(app: AppHandle, max_concurrent: u32) {
    let queue = DownloadQueue::new(
        Arc::new(TauriEventSink::new(app.clone())),
        Arc::new(YtdlpDownloader::new(app)),
        max_concurrent,
    );
    install_queue(queue);
}

/// Replace the process-wide queue.
pub fn install_queue(queue: Arc<DownloadQueue>) {
    *QUEUE.write().unwrap_or_else(|e| e.into_inner()) = Some(queue);
}

/// Get the download queue instance
pub fn get_queue() -> Result<Arc<DownloadQueue>> {
    QUEUE
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| ClipyError::Download("Download queue not initialized".into()))
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

#[cfg(test)]
pub(crate) mod testing {
    //! Controllable fakes shared by queue and command tests.

    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex as StdMutex;
    use tokio::sync::oneshot;

    /// One recorded event.
    #[derive(Debug, Clone, PartialEq)]
    pub enum Event {
        Progress {
            id: String,
            status: DownloadStatus,
            progress: f64,
            file_path: Option<String>,
        },
        LibraryUpdated,
    }

    /// [`EventSink`] that records everything.
    #[derive(Default)]
    pub struct RecordingSink {
        pub events: StdMutex<Vec<Event>>,
    }

    impl RecordingSink {
        pub fn statuses(&self, id: &str) -> Vec<DownloadStatus> {
            self.events
                .lock()
                .unwrap()
                .iter()
                .filter_map(|e| match e {
                    Event::Progress { id: i, status, .. } if i == id => Some(*status),
                    _ => None,
                })
                .collect()
        }

        pub fn library_updates(&self) -> usize {
            self.events
                .lock()
                .unwrap()
                .iter()
                .filter(|e| **e == Event::LibraryUpdated)
                .count()
        }

        pub fn all(&self) -> Vec<Event> {
            self.events.lock().unwrap().clone()
        }
    }

    impl EventSink for RecordingSink {
        fn download_progress(&self, p: &DownloadProgress) {
            self.events.lock().unwrap().push(Event::Progress {
                id: p.download_id.clone(),
                status: p.status,
                progress: p.progress,
                file_path: p.file_path.clone(),
            });
        }

        fn library_updated(&self) {
            self.events.lock().unwrap().push(Event::LibraryUpdated);
        }
    }

    struct Control {
        outcome: oneshot::Sender<Result<PathBuf>>,
        progress: mpsc::Sender<DownloadProgress>,
    }

    #[derive(Default)]
    struct Inner {
        controls: StdMutex<HashMap<String, Control>>,
        started: StdMutex<Vec<String>>,
        cancels: StdMutex<Vec<String>>,
        in_flight: AtomicUsize,
        peak: AtomicUsize,
    }

    /// [`Downloader`] whose runs block until the test finishes, fails or
    /// cancels them.
    #[derive(Default, Clone)]
    pub struct FakeDownloader {
        inner: Arc<Inner>,
        /// When set, `cancel` does NOT end the run (simulates a stuck process).
        pub ignore_cancel: bool,
    }

    impl FakeDownloader {
        /// A downloader whose runs ignore `cancel` (a stuck process).
        pub fn stubborn() -> Self {
            Self {
                ignore_cancel: true,
                ..Default::default()
            }
        }

        pub fn started(&self) -> Vec<String> {
            self.inner.started.lock().unwrap().clone()
        }

        pub fn cancels(&self) -> Vec<String> {
            self.inner.cancels.lock().unwrap().clone()
        }

        pub fn in_flight(&self) -> usize {
            self.inner.in_flight.load(Ordering::SeqCst)
        }

        pub fn peak(&self) -> usize {
            self.inner.peak.load(Ordering::SeqCst)
        }

        pub fn is_running(&self, id: &str) -> bool {
            self.inner.controls.lock().unwrap().contains_key(id)
        }

        pub fn resolve(&self, id: &str, result: Result<PathBuf>) {
            let control = self
                .inner
                .controls
                .lock()
                .unwrap()
                .remove(id)
                .unwrap_or_else(|| panic!("{id} is not running"));
            let _ = control.outcome.send(result);
        }

        pub fn succeed(&self, id: &str) {
            self.resolve(id, Ok(PathBuf::from(format!("/out/{id}.mp4"))));
        }

        pub fn fail(&self, id: &str, msg: &str) {
            self.resolve(id, Err(ClipyError::Ytdlp(msg.into())));
        }

        pub async fn send_progress(&self, id: &str, status: DownloadStatus, pct: f64) {
            let tx = self.inner.controls.lock().unwrap()[id].progress.clone();
            tx.send(DownloadProgress {
                download_id: id.into(),
                status,
                progress: pct,
                downloaded_bytes: pct as u64,
                total_bytes: 100,
                speed: 7,
                eta: 3,
                file_path: None,
            })
            .await
            .unwrap();
        }
    }

    impl Downloader for FakeDownloader {
        fn download(
            &self,
            id: String,
            _url: String,
            _options: DownloadOptions,
            progress: mpsc::Sender<DownloadProgress>,
        ) -> BoxFuture<'static, Result<PathBuf>> {
            let (tx, rx) = oneshot::channel();
            let inner = self.inner.clone();
            inner.controls.lock().unwrap().insert(
                id.clone(),
                Control {
                    outcome: tx,
                    progress,
                },
            );
            inner.started.lock().unwrap().push(id);
            let now = inner.in_flight.fetch_add(1, Ordering::SeqCst) + 1;
            inner.peak.fetch_max(now, Ordering::SeqCst);
            Box::pin(async move {
                let result = rx.await.unwrap_or(Err(ClipyError::Cancelled));
                inner.in_flight.fetch_sub(1, Ordering::SeqCst);
                result
            })
        }

        fn cancel<'a>(&'a self, id: &'a str) -> BoxFuture<'a, ()> {
            Box::pin(async move {
                self.inner.cancels.lock().unwrap().push(id.to_string());
                if self.ignore_cancel {
                    return;
                }
                let control = self.inner.controls.lock().unwrap().remove(id);
                if let Some(control) = control {
                    let _ = control.outcome.send(Err(ClipyError::Cancelled));
                }
            })
        }
    }

    pub fn task(id: &str) -> DownloadTask {
        DownloadTask {
            id: id.into(),
            video_id: format!("vid-{id}"),
            title: format!("Title {id}"),
            thumbnail: String::new(),
            url: format!("https://www.youtube.com/watch?v={id}&token=secret"),
            status: DownloadStatus::Pending,
            progress: 0.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed: 0,
            eta: 0,
            quality: "1080".into(),
            format: "mp4".into(),
            output_path: String::new(),
            error: None,
            created_at: format!("2024-01-01T00:00:{:0>2}Z", id.len()),
            completed_at: None,
            duration: 60,
            channel: "chan".into(),
            options: DownloadOptions::default(),
        }
    }

    pub struct Harness {
        pub queue: Arc<DownloadQueue>,
        pub sink: Arc<RecordingSink>,
        pub dl: FakeDownloader,
        pub db: Arc<Database>,
    }

    pub fn harness_with(max: u32, dl: FakeDownloader) -> Harness {
        let sink = Arc::new(RecordingSink::default());
        let queue = DownloadQueue::new(sink.clone(), Arc::new(dl.clone()), max);
        let db = Arc::new(Database::open_in_memory().unwrap());
        queue.set_library(db.clone());
        Harness {
            queue,
            sink,
            dl,
            db,
        }
    }

    pub fn harness(max: u32) -> Harness {
        harness_with(max, FakeDownloader::default())
    }

    /// Poll `cond` until it holds, failing the test after 5 seconds.
    pub async fn eventually<F, Fut>(what: &str, mut cond: F)
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = bool>,
    {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        while !cond().await {
            assert!(
                tokio::time::Instant::now() < deadline,
                "timed out waiting for: {what}"
            );
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }

    impl Harness {
        pub async fn status(&self, id: &str) -> Option<DownloadStatus> {
            self.queue.get_download(id).await.map(|t| t.status)
        }

        pub async fn wait_status(&self, id: &str, status: DownloadStatus) {
            eventually(&format!("{id} -> {status:?}"), || async {
                self.status(id).await == Some(status)
            })
            .await;
        }

        pub async fn wait_running(&self, id: &str) {
            eventually(&format!("{id} started"), || async {
                self.dl.is_running(id)
            })
            .await;
        }

        pub async fn add(&self, id: &str) {
            self.queue.add_download(task(id)).await.unwrap();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use DownloadStatus::*;

    #[tokio::test]
    async fn concurrency_limit_is_honored_and_slots_refill() {
        let h = harness(2);
        for id in ["a", "b", "c", "d"] {
            h.add(id).await;
        }
        h.wait_running("a").await;
        h.wait_running("b").await;
        assert_eq!(h.dl.started(), ["a", "b"]);
        assert_eq!(h.queue.get_pending_downloads().await.len(), 2);

        h.dl.succeed("a");
        h.wait_running("c").await;
        assert_eq!(h.dl.started(), ["a", "b", "c"]);

        h.dl.succeed("b");
        h.wait_running("d").await;
        h.dl.succeed("c");
        h.dl.succeed("d");
        for id in ["a", "b", "c", "d"] {
            h.wait_status(id, Completed).await;
        }
        assert_eq!(h.dl.peak(), 2);
        assert_eq!(h.db.get_library_videos().unwrap().len(), 4);
        assert_eq!(h.sink.library_updates(), 4);
    }

    #[tokio::test]
    async fn events_for_a_successful_download_are_ordered() {
        let h = harness(1);
        h.add("a").await;
        h.wait_running("a").await;
        h.dl.send_progress("a", Downloading, 50.0).await;
        h.dl.send_progress("a", Processing, 99.0).await;
        // Terminal/paused reports from the downloader are ignored.
        h.dl.send_progress("a", Completed, 100.0).await;
        h.dl.send_progress("a", Paused, 100.0).await;
        h.dl.succeed("a");
        h.wait_status("a", Completed).await;

        assert_eq!(
            h.sink.statuses("a"),
            [Pending, Downloading, Downloading, Processing, Completed]
        );
        let events = h.sink.all();
        let last = events.last().unwrap();
        assert_eq!(
            *last,
            Event::Progress {
                id: "a".into(),
                status: Completed,
                progress: 100.0,
                file_path: Some(PathBuf::from("/out/a.mp4").to_string_lossy().into()),
            }
        );
        assert_eq!(events[events.len() - 2], Event::LibraryUpdated);

        let done = h.queue.get_download("a").await.unwrap();
        assert!(done.completed_at.is_some());
        assert_eq!(
            done.output_path,
            PathBuf::from("/out/a.mp4").to_string_lossy()
        );
        let lib = h.db.get_library_videos().unwrap();
        assert_eq!(lib[0].video_id, "vid-a");
        assert_eq!(lib[0].resolution, "1080p");
    }

    #[tokio::test]
    async fn progress_updates_task_fields() {
        let h = harness(1);
        h.add("a").await;
        h.wait_running("a").await;
        h.dl.send_progress("a", Downloading, 42.0).await;
        eventually("progress applied", || async {
            h.queue.get_download("a").await.unwrap().progress == 42.0
        })
        .await;
        let t = h.queue.get_download("a").await.unwrap();
        assert_eq!(
            (t.downloaded_bytes, t.total_bytes, t.speed, t.eta),
            (42, 100, 7, 3)
        );
        h.dl.succeed("a");
    }

    #[tokio::test]
    async fn failure_marks_failed_and_frees_slot() {
        let h = harness(1);
        h.add("a").await;
        h.add("b").await;
        h.wait_running("a").await;
        h.dl.fail("a", "HTTP 403");
        h.wait_status("a", Failed).await;
        h.wait_running("b").await;

        let a = h.queue.get_download("a").await.unwrap();
        assert!(a.error.unwrap().contains("HTTP 403"));
        assert_eq!(h.sink.statuses("a"), [Pending, Downloading, Failed]);
        assert!(h.db.get_library_videos().unwrap().is_empty());
        h.dl.succeed("b");
    }

    #[tokio::test]
    async fn library_errors_do_not_block_completion() {
        let _g = crate::test_support::lock_globals_async().await;
        let sink = Arc::new(RecordingSink::default());
        let dl = FakeDownloader::default();

        // No library injected: completions go to the global database.
        let global = Arc::new(Database::open_in_memory().unwrap());
        database::install(global.clone());
        let queue = DownloadQueue::new(sink.clone(), Arc::new(dl.clone()), 1);
        queue.add_download(task("a")).await.unwrap();
        eventually("a started", || async { dl.is_running("a") }).await;
        dl.succeed("a");
        eventually("a completed", || async {
            queue.get_download("a").await.unwrap().status == Completed
        })
        .await;
        assert_eq!(global.get_library_videos().unwrap().len(), 1);
        assert_eq!(sink.library_updates(), 1);

        // A library that rejects writes still lets the download complete.
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        // Claiming a future schema version skips migrations, so the library
        // table never exists and every insert fails.
        conn.pragma_update(None, "user_version", 999u32).unwrap();
        let tableless = Arc::new(Database::from_connection(conn).unwrap());
        queue.set_library(tableless);
        queue.add_download(task("bb")).await.unwrap();
        eventually("bb started", || async { dl.is_running("bb") }).await;
        dl.succeed("bb");
        eventually("bb completed", || async {
            queue.get_download("bb").await.unwrap().status == Completed
        })
        .await;
        assert_eq!(sink.library_updates(), 1);
    }

    #[tokio::test]
    async fn cancel_running_reports_cancelled_not_failed_and_frees_slot() {
        let h = harness(1);
        h.add("a").await;
        h.add("b").await;
        h.wait_running("a").await;

        h.queue.cancel_download("a").await.unwrap();
        assert_eq!(h.status("a").await, Some(Cancelled));
        h.wait_running("b").await;
        assert_eq!(h.dl.cancels(), ["a"]);
        assert_eq!(h.sink.statuses("a"), [Pending, Downloading, Cancelled]);
        h.dl.succeed("b");
    }

    #[tokio::test]
    async fn cancel_pending_and_paused_and_dismiss_finished() {
        let h = harness(1);
        h.add("a").await;
        h.add("b").await;
        h.wait_running("a").await;

        h.queue.cancel_download("b").await.unwrap();
        assert_eq!(h.status("b").await, Some(Cancelled));
        assert!(h.queue.get_pending_downloads().await.is_empty());

        h.queue.pause_download("a").await.unwrap();
        h.queue.cancel_download("a").await.unwrap();
        assert_eq!(h.status("a").await, Some(Cancelled));

        // Cancelling something already finished dismisses it.
        h.queue.cancel_download("a").await.unwrap();
        assert_eq!(h.status("a").await, None);

        let err = h.queue.cancel_download("nope").await.unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn pause_then_resume_goes_through_the_queue() {
        let h = harness(1);
        h.add("a").await;
        h.add("b").await;
        h.wait_running("a").await;

        h.queue.pause_download("a").await.unwrap();
        // The killed run must not overwrite Paused with Failed.
        assert_eq!(h.status("a").await, Some(Paused));
        h.wait_running("b").await;
        assert_eq!(h.status("a").await, Some(Paused));
        h.queue.pause_download("a").await.unwrap();

        // Slot is taken by b, so a waits as pending instead of bypassing the limit.
        h.queue.resume_download("a").await.unwrap();
        assert_eq!(h.status("a").await, Some(Pending));
        assert_eq!(h.dl.in_flight(), 1);

        h.dl.succeed("b");
        h.wait_running("a").await;
        h.dl.succeed("a");
        h.wait_status("a", Completed).await;

        assert_eq!(
            h.sink.statuses("a"),
            [
                Pending,
                Downloading,
                Paused,
                Pending,
                Downloading,
                Completed
            ]
        );
        assert_eq!(h.dl.started(), ["a", "b", "a"]);
        assert_eq!(h.dl.peak(), 1);
    }

    #[tokio::test]
    async fn pause_and_resume_errors() {
        let h = harness(1);
        assert!(h.queue.pause_download("x").await.is_err());
        assert!(h.queue.resume_download("x").await.is_err());

        h.add("a").await;
        h.wait_running("a").await;
        let err = h.queue.resume_download("a").await.unwrap_err();
        assert!(err.to_string().contains("not paused"));

        h.dl.succeed("a");
        h.wait_status("a", Completed).await;
        let err = h.queue.pause_download("a").await.unwrap_err();
        assert!(err.to_string().contains("not running"));
    }

    #[tokio::test]
    async fn pausing_a_pending_task_parks_it() {
        let h = harness(1);
        h.add("a").await;
        h.add("b").await;
        h.wait_running("a").await;

        h.queue.pause_download("b").await.unwrap();
        assert_eq!(h.status("b").await, Some(Paused));
        h.dl.succeed("a");
        h.wait_status("a", Completed).await;
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(!h.dl.is_running("b"));

        h.queue.resume_download("b").await.unwrap();
        h.wait_running("b").await;
        h.dl.succeed("b");
    }

    #[tokio::test]
    async fn success_racing_a_pause_counts_as_completed_but_not_after_cancel() {
        let dl = FakeDownloader::stubborn();
        let h = harness_with(2, dl);
        h.add("p").await;
        h.add("c").await;
        h.wait_running("p").await;
        h.wait_running("c").await;

        let q = h.queue.clone();
        let pause = tokio::spawn(async move { q.pause_download("p").await });
        let q = h.queue.clone();
        let cancel = tokio::spawn(async move { q.cancel_download("c").await });
        eventually("both stop requests sent", || async {
            h.dl.cancels().len() == 2
        })
        .await;

        h.dl.succeed("p");
        h.dl.succeed("c");
        pause.await.unwrap().unwrap();
        cancel.await.unwrap().unwrap();

        h.wait_status("p", Completed).await;
        assert_eq!(h.status("c").await, Some(Cancelled));
        let lib = h.db.get_library_videos().unwrap();
        assert_eq!(lib.len(), 1);
        assert_eq!(lib[0].video_id, "vid-p");
    }

    #[tokio::test]
    async fn progress_after_pause_is_ignored() {
        let dl = FakeDownloader::stubborn();
        let h = harness_with(1, dl);
        h.add("a").await;
        h.wait_running("a").await;
        let q = h.queue.clone();
        let pause = tokio::spawn(async move { q.pause_download("a").await });
        eventually("pause requested", || async { !h.dl.cancels().is_empty() }).await;
        h.wait_status("a", Paused).await;

        h.dl.send_progress("a", Downloading, 80.0).await;
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(h.status("a").await, Some(Paused));

        h.dl.fail("a", "killed");
        pause.await.unwrap().unwrap();
        assert_eq!(h.status("a").await, Some(Paused));
        assert!(!h.sink.statuses("a").contains(&Failed));
    }

    #[tokio::test]
    async fn retry_requeues_failed_and_cancelled_under_same_id() {
        let h = harness(1);
        h.add("a").await;
        h.wait_running("a").await;
        assert!(h.queue.retry_download("a").await.is_err());
        h.dl.fail("a", "boom");
        h.wait_status("a", Failed).await;

        h.queue.retry_download("a").await.unwrap();
        h.wait_running("a").await;
        let t = h.queue.get_download("a").await.unwrap();
        assert_eq!(t.status, Downloading);
        assert!(t.error.is_none());

        h.queue.cancel_download("a").await.unwrap();
        h.queue.retry_download("a").await.unwrap();
        h.wait_running("a").await;
        h.dl.succeed("a");
        h.wait_status("a", Completed).await;

        assert_eq!(
            h.sink.statuses("a"),
            [
                Pending,
                Downloading,
                Failed,
                Pending,
                Downloading,
                Cancelled,
                Pending,
                Downloading,
                Completed
            ]
        );
        let err = h.queue.retry_download("a").await.unwrap_err();
        assert!(err.to_string().contains("retryable"));
        let err = h.queue.retry_download("zzz").await.unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn duplicate_ids_are_rejected() {
        let h = harness(1);
        h.add("a").await;
        h.add("b").await;
        let err = h.queue.add_download(task("a")).await.unwrap_err();
        assert!(err.to_string().contains("in progress"));
        let err = h.queue.add_download(task("b")).await.unwrap_err();
        assert!(err.to_string().contains("in queue"));
        h.wait_running("a").await;
        h.dl.succeed("a");
        h.wait_running("b").await;
        h.dl.succeed("b");
    }

    #[tokio::test]
    async fn shutdown_with_active_tasks_completes_without_deadlock() {
        let h = harness(2);
        h.add("done").await;
        h.wait_running("done").await;
        h.dl.succeed("done");
        h.wait_status("done", Completed).await;

        for id in ["a", "b", "p", "q"] {
            h.add(id).await;
        }
        h.wait_running("a").await;
        h.wait_running("b").await;
        h.queue.pause_download("b").await.unwrap();
        h.wait_running("p").await;

        tokio::time::timeout(Duration::from_secs(5), h.queue.shutdown())
            .await
            .expect("shutdown hung");

        for id in ["a", "b", "p"] {
            assert_eq!(h.status(id).await, Some(Cancelled), "{id}");
        }
        assert_eq!(h.status("done").await, Some(Completed));
        assert!(h.queue.get_pending_downloads().await.is_empty());
        assert!(h.sink.statuses("q").ends_with(&[Cancelled]));
        assert_eq!(h.dl.in_flight(), 0);
        assert!(!h.sink.statuses("a").contains(&Failed));

        let err = h.queue.add_download(task("late")).await.unwrap_err();
        assert!(err.to_string().contains("shutting down"));
        assert!(h.queue.retry_download("a").await.is_err());
        // A second shutdown is harmless.
        tokio::time::timeout(Duration::from_secs(5), h.queue.shutdown())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn shutdown_gives_up_on_stuck_downloads() {
        tokio::time::pause();
        let dl = FakeDownloader::stubborn();
        let h = harness_with(1, dl);
        h.add("stuck").await;
        h.queue.shutdown().await;
        assert_eq!(h.status("stuck").await, Some(Cancelled));
        assert_eq!(h.dl.cancels(), ["stuck"]);
    }

    #[tokio::test]
    async fn concurrency_is_clamped_and_raising_it_starts_work() {
        let h = harness(0);
        assert_eq!(h.queue.max_concurrent().await, 1);
        assert_eq!(h.queue.set_max_concurrent(0).await, 1);
        assert_eq!(h.queue.set_max_concurrent(1000).await, MAX_CONCURRENT);
        assert_eq!(h.queue.set_max_concurrent(1).await, 1);

        for id in ["a", "b", "c"] {
            h.add(id).await;
        }
        h.wait_running("a").await;
        assert_eq!(h.dl.in_flight(), 1);
        assert_eq!(h.queue.set_max_concurrent(3).await, 3);
        h.wait_running("b").await;
        h.wait_running("c").await;
        for id in ["a", "b", "c"] {
            h.dl.succeed(id);
        }
        assert_eq!(clamp_concurrency(5), 5);
    }

    #[tokio::test]
    async fn listing_and_clear_completed() {
        let h = harness(1);
        h.add("a").await;
        h.add("bb").await;
        h.add("ccc").await;
        h.wait_running("a").await;

        let all: Vec<String> = h
            .queue
            .get_all_downloads()
            .await
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(all, ["a", "bb", "ccc"]);
        assert_eq!(h.queue.get_active_downloads().await.len(), 1);

        h.dl.fail("a", "x");
        h.wait_running("bb").await;
        h.queue.cancel_download("ccc").await.unwrap();
        h.dl.succeed("bb");
        h.wait_status("bb", Completed).await;

        h.queue.clear_completed().await;
        assert!(h.queue.get_all_downloads().await.is_empty());
    }

    #[tokio::test]
    async fn global_queue_install_and_get() {
        let _g = crate::test_support::lock_globals_async().await;
        let h = harness(1);
        install_queue(h.queue.clone());
        assert!(Arc::ptr_eq(&get_queue().unwrap(), &h.queue));
    }

    #[test]
    fn tauri_event_sink_emits_to_listeners() {
        use tauri::Listener;
        let app = tauri::test::mock_app();
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        for name in ["download-progress", "library-updated"] {
            let seen = seen.clone();
            app.listen_any(name, move |e| {
                seen.lock().unwrap().push(e.payload().to_string());
            });
        }
        let sink = TauriEventSink::new(app.handle().clone());
        sink.download_progress(&progress_of(&task("a"), None));
        sink.library_updated();
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        assert!(seen[0].contains("\"downloadId\":\"a\""));
    }
}
