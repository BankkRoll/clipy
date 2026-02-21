//! Platform-specific utilities

use serde::Serialize;

/// Platform information
#[derive(Serialize, Debug)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
}

/// Get current platform information
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: get_os_version(),
    }
}

/// Get the OS version string
fn get_os_version() -> String {
    #[cfg(target_os = "windows")]
    {
        // On Windows, we could use winapi to get more detailed version info
        // For now, just return a generic string
        "Windows".to_string()
    }

    #[cfg(target_os = "macos")]
    {
        "macOS".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        "Linux".to_string()
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "Unknown".to_string()
    }
}

/// Get the target triple for binary downloads
pub fn get_target_triple() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }

    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "aarch64-pc-windows-msvc"
    }

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "aarch64-unknown-linux-gnu"
    }

    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
    )))]
    {
        "unknown"
    }
}

/// Check if the current platform is Windows
pub fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

/// Check if the current platform is macOS
pub fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

/// Check if the current platform is Linux
pub fn is_linux() -> bool {
    cfg!(target_os = "linux")
}
