//! Platform-specific utilities

use serde::Serialize;

/// Platform information
#[derive(Serialize, Debug)]
pub struct PlatformInfo {
    /// `std::env::consts::OS` value (`"windows"`, `"macos"`, `"linux"`, ...).
    pub os: String,
    /// `std::env::consts::ARCH` value (`"x86_64"`, `"aarch64"`, ...).
    pub arch: String,
    /// Human-readable OS family name.
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
    os_display_name(std::env::consts::OS).to_string()
}

/// Human-readable name for a `std::env::consts::OS` value.
pub fn os_display_name(os: &str) -> &'static str {
    match os {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        _ => "Unknown",
    }
}

/// Get the target triple for binary downloads
pub fn get_target_triple() -> &'static str {
    target_triple_for(std::env::consts::OS, std::env::consts::ARCH)
}

/// Map an OS/arch pair (as in `std::env::consts`) to the target triple used
/// when picking prebuilt binaries; `"unknown"` for unsupported combinations.
pub fn target_triple_for(os: &str, arch: &str) -> &'static str {
    match (os, arch) {
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("windows", "aarch64") => "aarch64-pc-windows-msvc",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        _ => "unknown",
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_info_matches_compile_target() {
        let info = get_platform_info();
        assert_eq!(info.os, std::env::consts::OS);
        assert_eq!(info.arch, std::env::consts::ARCH);
        assert_eq!(info.version, os_display_name(std::env::consts::OS));
        assert_eq!(os_display_name("windows"), "Windows");
        assert_eq!(os_display_name("macos"), "macOS");
        assert_eq!(os_display_name("linux"), "Linux");
        assert_eq!(os_display_name("haiku"), "Unknown");
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["os"], std::env::consts::OS);
    }

    #[test]
    fn exactly_one_os_predicate_is_true_on_supported_platforms() {
        let flags = [is_windows(), is_macos(), is_linux()];
        assert_eq!(flags.iter().filter(|f| **f).count(), 1);
    }

    #[test]
    fn target_triples_cover_supported_matrix() {
        assert_eq!(
            target_triple_for("windows", "x86_64"),
            "x86_64-pc-windows-msvc"
        );
        assert_eq!(
            target_triple_for("windows", "aarch64"),
            "aarch64-pc-windows-msvc"
        );
        assert_eq!(target_triple_for("macos", "x86_64"), "x86_64-apple-darwin");
        assert_eq!(
            target_triple_for("macos", "aarch64"),
            "aarch64-apple-darwin"
        );
        assert_eq!(
            target_triple_for("linux", "x86_64"),
            "x86_64-unknown-linux-gnu"
        );
        assert_eq!(
            target_triple_for("linux", "aarch64"),
            "aarch64-unknown-linux-gnu"
        );
        assert_eq!(target_triple_for("freebsd", "x86_64"), "unknown");
        assert_eq!(target_triple_for("linux", "riscv64"), "unknown");
    }

    #[test]
    fn current_target_triple_is_known() {
        assert_eq!(
            get_target_triple(),
            target_triple_for(std::env::consts::OS, std::env::consts::ARCH)
        );
        assert_ne!(get_target_triple(), "unknown");
    }
}
