//! Spawning helper programs (yt-dlp, FFmpeg, whisper, `where`) without
//! flashing console windows.
//!
//! Clipy is a GUI-subsystem app on Windows, so every console program it starts
//! would otherwise get a brand-new console window. All production spawns go
//! through these constructors.

use std::ffi::OsStr;

/// Win32 `CREATE_NO_WINDOW`: run a console program without creating a console.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A [`std::process::Command`] that never opens a console window.
pub fn std_command(program: impl AsRef<OsStr>) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// A [`tokio::process::Command`] that never opens a console window.
pub fn tokio_command(program: impl AsRef<OsStr>) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands_keep_the_program_and_still_run() {
        let echo = if cfg!(windows) { "cmd" } else { "sh" };
        let flag = if cfg!(windows) { "/C" } else { "-c" };
        let out = std_command(echo)
            .args([flag, "echo hidden"])
            .output()
            .unwrap();
        assert!(out.status.success());
        assert!(String::from_utf8_lossy(&out.stdout).contains("hidden"));
        assert_eq!(std_command("x").get_program(), "x");
    }

    #[tokio::test]
    async fn tokio_commands_still_run() {
        let echo = if cfg!(windows) { "cmd" } else { "sh" };
        let flag = if cfg!(windows) { "/C" } else { "-c" };
        let out = tokio_command(echo)
            .args([flag, "echo hidden"])
            .output()
            .await
            .unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).contains("hidden"));
    }
}
