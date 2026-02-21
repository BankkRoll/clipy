//! Download queue management service

use crate::error::{ClipyError, Result};
use crate::models::download::{DownloadProgress, DownloadStatus, DownloadTask};
use crate::models::library::LibraryVideo;
use crate::services::{database, ytdlp};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{debug, error, info};

/// Download queue state
pub struct DownloadQueue {
    /// Active downloads
    active: Arc<RwLock<HashMap<String, DownloadTask>>>,
    /// Pending downloads
    pending: Arc<RwLock<Vec<DownloadTask>>>,
    /// Maximum concurrent downloads
    max_concurrent: RwLock<u32>,
    /// App handle for Tauri operations
    app: AppHandle,
    /// Shutdown signal
    shutdown: Mutex<bool>,
}

impl DownloadQueue {
    /// Create a new download queue
    pub fn new(app: AppHandle, max_concurrent: u32) -> Arc<Self> {
        Arc::new(Self {
            active: Arc::new(RwLock::new(HashMap::new())),
            pending: Arc::new(RwLock::new(Vec::new())),
            max_concurrent: RwLock::new(max_concurrent),
            app,
            shutdown: Mutex::new(false),
        })
    }

    /// Add a download to the queue
    pub async fn add_download(&self, task: DownloadTask) -> Result<()> {
        info!("Adding download to queue: {}", task.title);

        // Check if already in queue
        {
            let active = self.active.read().await;
            if active.contains_key(&task.id) {
                return Err(ClipyError::Download("Download already in progress".into()));
            }
        }

        {
            let pending = self.pending.read().await;
            if pending.iter().any(|t| t.id == task.id) {
                return Err(ClipyError::Download("Download already in queue".into()));
            }
        }

        // Add to pending
        {
            let mut pending = self.pending.write().await;
            pending.push(task);
        }

        // Try to start downloads
        self.process_queue().await?;

        Ok(())
    }

    /// Process the queue and start downloads
    async fn process_queue(&self) -> Result<()> {
        let max_concurrent = *self.max_concurrent.read().await;
        let pending_count = self.pending.read().await.len();
        debug!("Processing queue: {} pending, max concurrent: {}", pending_count, max_concurrent);

        loop {
            let active_count = self.active.read().await.len();
            debug!("Active downloads: {}/{}", active_count, max_concurrent);
            if active_count >= max_concurrent as usize {
                break;
            }

            let task = {
                let mut pending = self.pending.write().await;
                if pending.is_empty() {
                    break;
                }
                pending.remove(0)
            };

            // Start the download
            self.start_download(task).await?;
        }

        Ok(())
    }

    /// Start a download task
    async fn start_download(&self, mut task: DownloadTask) -> Result<()> {
        info!("Starting download: {}", task.title);

        task.status = DownloadStatus::Downloading;

        // Add to active
        {
            let mut active = self.active.write().await;
            active.insert(task.id.clone(), task.clone());
        }

        // Emit status update
        self.emit_progress(&DownloadProgress {
            download_id: task.id.clone(),
            status: DownloadStatus::Downloading,
            progress: 0.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed: 0,
            eta: 0,
            file_path: None,
        });

        // Create progress channel
        let (progress_tx, mut progress_rx) = mpsc::channel::<DownloadProgress>(100);

        // Clone for async task
        let _app = self.app.clone();
        let task_id = task.id.clone();
        let url = task.url.clone();
        // Use the full options stored in the task
        let options = task.options.clone();

        // Handle progress updates in a separate task
        let app_clone = self.app.clone();
        let active_ref = self.active.clone();
        let task_id_clone = task.id.clone();

        tokio::spawn(async move {
            while let Some(progress) = progress_rx.recv().await {
                debug!("Queue received progress: {}% for {}", progress.progress, task_id_clone);

                // Update active task
                {
                    let mut active = active_ref.write().await;
                    if let Some(t) = active.get_mut(&task_id_clone) {
                        t.status = progress.status.clone();
                        t.progress = progress.progress;
                        t.downloaded_bytes = progress.downloaded_bytes;
                        t.total_bytes = progress.total_bytes;
                        t.speed = progress.speed;
                        t.eta = progress.eta;
                    }
                }

                // Emit to frontend
                if let Err(e) = app_clone.emit("download-progress", &progress) {
                    error!("Failed to emit progress event: {}", e);
                }
            }
            debug!("Progress receiver closed for {}", task_id_clone);
        });

        // Spawn download task and handle completion/errors
        let app_for_download = self.app.clone();
        let active_for_completion = self.active.clone();
        let task_id_for_completion = task.id.clone();

        tokio::spawn(async move {
            let result = ytdlp::download_video(&app_for_download, task_id.clone(), &url, &options, progress_tx).await;

            // Update task status based on result
            let mut active = active_for_completion.write().await;
            if let Some(t) = active.get_mut(&task_id_for_completion) {
                let mut completed_file_path: Option<String> = None;

                match result {
                    Ok(file_path) => {
                        t.status = DownloadStatus::Completed;
                        t.progress = 100.0;
                        t.completed_at = Some(chrono::Utc::now().to_rfc3339());
                        let file_path_str = file_path.to_string_lossy().to_string();
                        completed_file_path = Some(file_path_str.clone());
                        t.output_path = file_path_str.clone(); // Update to actual file path
                        info!("Download completed: {} -> {}", t.title, file_path_str);

                        // Get file size
                        let file_size = std::fs::metadata(&file_path)
                            .map(|m| m.len())
                            .unwrap_or(0);

                        // Save to library
                        let library_video = LibraryVideo::new(
                            t.video_id.clone(),
                            t.title.clone(),
                            t.thumbnail.clone(),
                            t.duration,
                            t.channel.clone(),
                            file_path_str,
                            file_size,
                            t.format.clone(),
                            format!("{}p", t.quality),
                            t.url.clone(),
                        );

                        if let Err(e) = database::add_library_video(&library_video) {
                            error!("Failed to add video to library: {}", e);
                        } else {
                            info!("Video added to library: {}", t.title);
                        }
                    }
                    Err(e) => {
                        t.status = DownloadStatus::Failed;
                        t.error = Some(e.to_string());
                        error!("Download failed: {} - {}", t.title, e);
                    }
                }

                // Emit final status with file path for completed downloads
                let _ = app_for_download.emit("download-progress", &DownloadProgress {
                    download_id: task_id_for_completion.clone(),
                    status: t.status.clone(),
                    progress: t.progress,
                    downloaded_bytes: t.downloaded_bytes,
                    total_bytes: t.total_bytes,
                    speed: 0,
                    eta: 0,
                    file_path: completed_file_path,
                });
            }
        });

        Ok(())
    }

    /// Emit progress to frontend
    fn emit_progress(&self, progress: &DownloadProgress) {
        let _ = self.app.emit("download-progress", progress);
    }

    /// Pause a download
    pub async fn pause_download(&self, id: &str) -> Result<()> {
        info!("Pausing download: {}", id);

        // Kill the yt-dlp process if it's running
        // Note: yt-dlp doesn't support true pausing, so we kill and restart on resume
        if let Some(registry) = crate::services::process_registry::get_registry() {
            registry.kill(id).await;
        }

        let mut active = self.active.write().await;
        if let Some(task) = active.get_mut(id) {
            task.status = DownloadStatus::Paused;
            self.emit_progress(&DownloadProgress {
                download_id: id.to_string(),
                status: DownloadStatus::Paused,
                progress: task.progress,
                downloaded_bytes: task.downloaded_bytes,
                total_bytes: task.total_bytes,
                speed: 0,
                eta: 0,
                file_path: None,
            });
            Ok(())
        } else {
            Err(ClipyError::Download("Download not found".into()))
        }
    }

    /// Resume a paused download
    pub async fn resume_download(&self, id: &str) -> Result<()> {
        info!("Resuming download: {}", id);

        let task = {
            let mut active = self.active.write().await;
            if let Some(task) = active.remove(id) {
                if task.status == DownloadStatus::Paused {
                    Some(task)
                } else {
                    active.insert(id.to_string(), task);
                    None
                }
            } else {
                None
            }
        };

        if let Some(task) = task {
            self.start_download(task).await?;
            Ok(())
        } else {
            Err(ClipyError::Download("Download not found or not paused".into()))
        }
    }

    /// Cancel a download
    pub async fn cancel_download(&self, id: &str) -> Result<()> {
        info!("Cancelling download: {}", id);

        // Kill the yt-dlp process if it's running
        if let Some(registry) = crate::services::process_registry::get_registry() {
            registry.kill(id).await;
        }

        // Remove from active
        {
            let mut active = self.active.write().await;
            if active.remove(id).is_some() {
                self.emit_progress(&DownloadProgress {
                    download_id: id.to_string(),
                    status: DownloadStatus::Cancelled,
                    progress: 0.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    speed: 0,
                    eta: 0,
                    file_path: None,
                });
                return Ok(());
            }
        }

        // Remove from pending
        {
            let mut pending = self.pending.write().await;
            if let Some(idx) = pending.iter().position(|t| t.id == id) {
                pending.remove(idx);
                self.emit_progress(&DownloadProgress {
                    download_id: id.to_string(),
                    status: DownloadStatus::Cancelled,
                    progress: 0.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    speed: 0,
                    eta: 0,
                    file_path: None,
                });
                return Ok(());
            }
        }

        Err(ClipyError::Download("Download not found".into()))
    }

    /// Get all downloads (active + pending)
    pub async fn get_all_downloads(&self) -> Vec<DownloadTask> {
        let mut downloads = Vec::new();

        {
            let active = self.active.read().await;
            downloads.extend(active.values().cloned());
        }

        {
            let pending = self.pending.read().await;
            downloads.extend(pending.iter().cloned());
        }

        downloads
    }

    /// Get active downloads
    pub async fn get_active_downloads(&self) -> Vec<DownloadTask> {
        let active = self.active.read().await;
        active.values().cloned().collect()
    }

    /// Get pending downloads
    pub async fn get_pending_downloads(&self) -> Vec<DownloadTask> {
        let pending = self.pending.read().await;
        pending.clone()
    }

    /// Clear completed downloads
    pub async fn clear_completed(&self) {
        let mut active = self.active.write().await;
        active.retain(|_, task| {
            task.status != DownloadStatus::Completed &&
            task.status != DownloadStatus::Failed &&
            task.status != DownloadStatus::Cancelled
        });
    }

    /// Set maximum concurrent downloads
    pub async fn set_max_concurrent(&self, max: u32) {
        let mut max_concurrent = self.max_concurrent.write().await;
        *max_concurrent = max;

        // Process queue in case we can start more downloads
        let _ = self.process_queue().await;
    }

    /// Shutdown the queue
    pub async fn shutdown(&self) {
        info!("Shutting down download queue");

        let mut shutdown = self.shutdown.lock().await;
        *shutdown = true;

        // Cancel all active downloads
        let active = self.active.read().await;
        for id in active.keys() {
            let _ = self.cancel_download(id).await;
        }
    }
}

/// Global download queue instance
static QUEUE: tokio::sync::OnceCell<Arc<DownloadQueue>> = tokio::sync::OnceCell::const_new();

/// Initialize the download queue
pub fn init_queue(app: AppHandle, max_concurrent: u32) {
    let queue = DownloadQueue::new(app, max_concurrent);
    let _ = QUEUE.set(queue);
}

/// Get the download queue instance
pub fn get_queue() -> Result<Arc<DownloadQueue>> {
    QUEUE.get()
        .cloned()
        .ok_or_else(|| ClipyError::Download("Download queue not initialized".into()))
}
