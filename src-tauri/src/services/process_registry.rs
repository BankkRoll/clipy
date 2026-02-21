//! Process registry for tracking and managing spawned processes

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Registry for tracking spawned processes
pub struct ProcessRegistry {
    /// Map of download ID to process ID
    processes: RwLock<HashMap<String, u32>>,
}

impl ProcessRegistry {
    /// Create a new process registry
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            processes: RwLock::new(HashMap::new()),
        })
    }

    /// Register a process
    pub async fn register(&self, download_id: &str, pid: u32) {
        let mut processes = self.processes.write().await;
        processes.insert(download_id.to_string(), pid);
        debug!("Registered process {} for download {}", pid, download_id);
    }

    /// Unregister a process
    pub async fn unregister(&self, download_id: &str) {
        let mut processes = self.processes.write().await;
        if let Some(pid) = processes.remove(download_id) {
            debug!("Unregistered process {} for download {}", pid, download_id);
        }
    }

    /// Kill a process by download ID
    pub async fn kill(&self, download_id: &str) -> bool {
        let processes = self.processes.read().await;
        if let Some(&pid) = processes.get(download_id) {
            info!("Killing process {} for download {}", pid, download_id);
            drop(processes); // Release lock before killing

            let killed = kill_process(pid);

            // Unregister after killing
            self.unregister(download_id).await;

            return killed;
        }
        warn!("No process found for download {}", download_id);
        false
    }

    /// Check if a process is registered
    pub async fn is_registered(&self, download_id: &str) -> bool {
        let processes = self.processes.read().await;
        processes.contains_key(download_id)
    }

    /// Get process ID for a download
    pub async fn get_pid(&self, download_id: &str) -> Option<u32> {
        let processes = self.processes.read().await;
        processes.get(download_id).copied()
    }
}

/// Kill a process by PID (cross-platform)
#[cfg(windows)]
fn kill_process(pid: u32) -> bool {
    use std::process::Command;

    // Use taskkill on Windows
    let result = Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                info!("Successfully killed process {} and its children", pid);
                true
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                warn!("Failed to kill process {}: {}", pid, stderr);
                false
            }
        }
        Err(e) => {
            warn!("Failed to execute taskkill: {}", e);
            false
        }
    }
}

#[cfg(unix)]
fn kill_process(pid: u32) -> bool {
    use std::process::Command;

    // Use kill on Unix - kill the process group
    let result = Command::new("kill")
        .args(["-TERM", &format!("-{}", pid)])  // Negative PID kills process group
        .output();

    // If that fails, try just the process
    let success = match result {
        Ok(output) => output.status.success(),
        Err(_) => false,
    };

    if !success {
        // Try killing just the process
        let result = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    info!("Successfully killed process {}", pid);
                    true
                } else {
                    warn!("Failed to kill process {}", pid);
                    false
                }
            }
            Err(e) => {
                warn!("Failed to execute kill: {}", e);
                false
            }
        }
    } else {
        info!("Successfully killed process group {}", pid);
        true
    }
}

/// Global process registry instance
static REGISTRY: tokio::sync::OnceCell<Arc<ProcessRegistry>> = tokio::sync::OnceCell::const_new();

/// Initialize the process registry
pub fn init_registry() {
    let registry = ProcessRegistry::new();
    let _ = REGISTRY.set(registry);
}

/// Get the process registry instance
pub fn get_registry() -> Option<Arc<ProcessRegistry>> {
    REGISTRY.get().cloned()
}
