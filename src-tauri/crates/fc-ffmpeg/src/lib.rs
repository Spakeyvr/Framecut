use std::process::Command;

pub fn ffmpeg_command() -> Command {
    base_command("ffmpeg")
}

pub fn ffprobe_command() -> Command {
    base_command("ffprobe")
}

pub fn tokio_ffmpeg_command() -> tokio::process::Command {
    tokio_base_command("ffmpeg")
}

fn base_command(binary: &str) -> Command {
    let mut cmd = Command::new(command_name(binary));
    apply_windows_no_window_flag(&mut cmd);
    cmd
}

fn tokio_base_command(binary: &str) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(command_name(binary));
    apply_windows_no_window_flag_tokio(&mut cmd);
    cmd
}

#[cfg(windows)]
fn command_name(binary: &str) -> String {
    format!("{binary}.exe")
}

#[cfg(not(windows))]
fn command_name(binary: &str) -> String {
    binary.to_string()
}

#[cfg(windows)]
fn apply_windows_no_window_flag(cmd: &mut Command) {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    std::os::windows::process::CommandExt::creation_flags(cmd, CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn apply_windows_no_window_flag(_cmd: &mut Command) {}

#[cfg(windows)]
fn apply_windows_no_window_flag_tokio(cmd: &mut tokio::process::Command) {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    std::os::windows::process::CommandExt::creation_flags(cmd.as_std_mut(), CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn apply_windows_no_window_flag_tokio(_cmd: &mut tokio::process::Command) {}
