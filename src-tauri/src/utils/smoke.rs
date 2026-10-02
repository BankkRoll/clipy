//! Installer smoke-test mode.
//!
//! With `CLIPY_SMOKE_TEST=1`, the installed app proves it booted end to end:
//! the frontend calls `app_ready` once React has mounted, which exits the
//! process with code 0. A watchdog exits non-zero if that never happens (blank
//! webview, broken asset bundle, setup panic swallowed by the event loop), so
//! CI can assert on the exit code alone. In normal runs none of this is active.

use std::time::Duration;
use tracing::error;

/// Environment variable that enables smoke-test mode.
pub const SMOKE_ENV: &str = "CLIPY_SMOKE_TEST";

/// How long the frontend has to report ready before the watchdog fails the run.
pub const READY_TIMEOUT: Duration = Duration::from_secs(90);

/// Exit code used when the frontend never reported ready.
pub const TIMEOUT_EXIT_CODE: i32 = 3;

/// Whether an environment value enables smoke mode. Only the exact value `1`
/// counts, so a stray empty or `0` value never makes a user's app exit.
pub fn is_enabled_value(value: Option<&str>) -> bool {
    value == Some("1")
}

/// Whether the current process runs in smoke-test mode.
pub fn is_enabled() -> bool {
    is_enabled_value(std::env::var(SMOKE_ENV).ok().as_deref())
}

/// Start the watchdog that fails the run if the frontend never reports ready.
pub fn start_watchdog(timeout: Duration) {
    std::thread::spawn(move || {
        std::thread::sleep(timeout);
        error!("Smoke test: frontend did not report ready within {timeout:?}");
        std::process::exit(TIMEOUT_EXIT_CODE);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exact_one_enables_smoke_mode() {
        assert!(is_enabled_value(Some("1")));
        assert!(!is_enabled_value(None));
        assert!(!is_enabled_value(Some("")));
        assert!(!is_enabled_value(Some("0")));
        assert!(!is_enabled_value(Some("true")));
    }

    #[test]
    fn smoke_mode_is_off_by_default_in_tests() {
        assert!(!is_enabled());
    }
}
