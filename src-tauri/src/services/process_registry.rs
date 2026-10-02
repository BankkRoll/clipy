//! Process registry for tracking and managing spawned processes
//!
//! Maps download IDs to the PID of the external process (yt-dlp) doing the
//! work, so pause/cancel/shutdown can terminate it together with its children.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Registry for tracking spawned processes
#[derive(Default)]
pub struct ProcessRegistry {
    processes: RwLock<HashMap<String, u32>>,
}

impl ProcessRegistry {
    /// Create a new process registry
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Register `pid` as the process for `download_id`, replacing any
    /// previous entry.
    pub async fn register(&self, download_id: &str, pid: u32) {
        let mut processes = self.processes.write().await;
        processes.insert(download_id.to_string(), pid);
        debug!("Registered process {} for download {}", pid, download_id);
    }

    /// Unregister a process. Unknown IDs are ignored.
    pub async fn unregister(&self, download_id: &str) {
        let mut processes = self.processes.write().await;
        if let Some(pid) = processes.remove(download_id) {
            debug!("Unregistered process {} for download {}", pid, download_id);
        }
    }

    /// Kill the process (tree) registered for `download_id`.
    ///
    /// The entry is removed before the kill is attempted, so it never lingers
    /// even if the process already exited or the kill fails. Returns whether a
    /// kill signal was successfully delivered.
    pub async fn kill(&self, download_id: &str) -> bool {
        let pid = self.processes.write().await.remove(download_id);
        match pid {
            Some(pid) => {
                info!("Killing process {} for download {}", pid, download_id);
                kill_process_tree(pid)
            }
            None => {
                debug!("No process registered for download {}", download_id);
                false
            }
        }
    }

    /// Check if a process is registered
    pub async fn is_registered(&self, download_id: &str) -> bool {
        self.processes.read().await.contains_key(download_id)
    }

    /// Get process ID for a download
    pub async fn get_pid(&self, download_id: &str) -> Option<u32> {
        self.processes.read().await.get(download_id).copied()
    }

    /// Number of registered processes.
    pub async fn len(&self) -> usize {
        self.processes.read().await.len()
    }

    /// Whether no processes are registered.
    pub async fn is_empty(&self) -> bool {
        self.processes.read().await.is_empty()
    }
}

/// Terminate `pid` and its descendants. Returns whether the OS accepted the
/// request.
///
/// - Windows: `taskkill /F /T` (tree kill).
/// - Unix: `SIGTERM` to the process group `-pid` (yt-dlp is spawned as its own
///   group leader so ffmpeg post-processors die with it), falling back to the
///   single process when no such group exists.
pub fn kill_process_tree(pid: u32) -> bool {
    if pid == 0 {
        warn!("Refusing to kill PID 0");
        return false;
    }
    platform_kill(pid)
}

#[cfg(windows)]
fn platform_kill(pid: u32) -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    // SECURITY: resolve taskkill from System32 instead of PATH so a
    // `taskkill.exe` planted in the working directory or PATH can't run.
    let system_root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
    let taskkill = std::path::Path::new(&system_root)
        .join("System32")
        .join("taskkill.exe");

    match Command::new(&taskkill)
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) if output.status.success() => {
            info!("Killed process tree {}", pid);
            true
        }
        Ok(output) => {
            warn!(
                "Failed to kill process {}: {}",
                pid,
                String::from_utf8_lossy(&output.stderr).trim()
            );
            false
        }
        Err(e) => {
            warn!("Failed to execute {:?}: {}", taskkill, e);
            false
        }
    }
}

#[cfg(unix)]
fn platform_kill(pid: u32) -> bool {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        warn!("PID {} out of range", pid);
        return false;
    };
    // SAFETY: kill(2) has no memory-safety preconditions; pid is > 0 so the
    // negated value addresses exactly that process group, never "all
    // processes" (-1) or our own group (0).
    if unsafe { libc::kill(-pid, libc::SIGTERM) } == 0 {
        info!("Killed process group {}", pid);
        return true;
    }
    // SAFETY: as above, pid > 0 targets a single process.
    if unsafe { libc::kill(pid, libc::SIGTERM) } == 0 {
        info!("Killed process {}", pid);
        true
    } else {
        warn!(
            "Failed to kill process {}: {}",
            pid,
            std::io::Error::last_os_error()
        );
        false
    }
}

static REGISTRY: std::sync::OnceLock<Arc<ProcessRegistry>> = std::sync::OnceLock::new();

/// Initialize the process registry
pub fn init_registry() {
    let _ = REGISTRY.set(ProcessRegistry::new());
}

/// Get the process registry instance
pub fn get_registry() -> Option<Arc<ProcessRegistry>> {
    REGISTRY.get().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Child, Command, Stdio};
    use std::time::{Duration, Instant};

    fn spawn_sleeper() -> Child {
        #[cfg(windows)]
        let mut cmd = {
            let mut c = Command::new("ping");
            c.args(["-n", "30", "127.0.0.1"]);
            c
        };
        #[cfg(unix)]
        let mut cmd = {
            let mut c = Command::new("sleep");
            c.arg("30");
            c
        };
        cmd.stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }

    fn wait_exit(child: &mut Child, limit: Duration) -> bool {
        let start = Instant::now();
        while start.elapsed() < limit {
            if child.try_wait().unwrap().is_some() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    #[tokio::test]
    async fn register_lookup_unregister() {
        let registry = ProcessRegistry::new();
        assert!(registry.is_empty().await);
        registry.register("a", 10).await;
        registry.register("b", 20).await;
        registry.register("a", 11).await;

        assert!(registry.is_registered("a").await);
        assert_eq!(registry.get_pid("a").await, Some(11));
        assert_eq!(registry.len().await, 2);

        registry.unregister("a").await;
        registry.unregister("never").await;
        assert!(!registry.is_registered("a").await);
        assert_eq!(registry.get_pid("a").await, None);
        assert_eq!(registry.len().await, 1);
    }

    #[tokio::test]
    async fn kill_unknown_id_is_false() {
        let registry = ProcessRegistry::new();
        assert!(!registry.kill("missing").await);
    }

    #[tokio::test]
    async fn kill_terminates_a_real_process_and_unregisters_it() {
        let mut child = spawn_sleeper();
        let registry = ProcessRegistry::new();
        registry.register("dl", child.id()).await;

        assert!(registry.kill("dl").await);
        assert!(!registry.is_registered("dl").await);
        assert!(
            wait_exit(&mut child, Duration::from_secs(10)),
            "process survived kill"
        );
        assert!(!child.wait().unwrap().success());
    }

    #[tokio::test]
    async fn kill_of_exited_process_still_unregisters() {
        let mut child = spawn_sleeper();
        let pid = child.id();
        child.kill().unwrap();
        child.wait().unwrap();

        let registry = ProcessRegistry::new();
        registry.register("dl", pid).await;
        assert!(!registry.kill("dl").await);
        assert!(!registry.is_registered("dl").await);
    }

    #[test]
    fn pid_zero_is_refused() {
        assert!(!kill_process_tree(0));
    }

    #[test]
    fn global_registry_is_initialised_once() {
        init_registry();
        let a = get_registry().unwrap();
        init_registry();
        assert!(Arc::ptr_eq(&a, &get_registry().unwrap()));
    }
}
