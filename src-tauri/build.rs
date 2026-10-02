fn main() {
    let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    if !windows_msvc {
        tauri_build::build();
        return;
    }

    // NOTE: tauri-build only embeds its Common-Controls v6 manifest into
    // `[[bin]]` targets. Unit/integration test executables then load comctl32
    // v5, which lacks by-name exports tauri's menu/tray code imports, and die at
    // load with STATUS_ENTRYPOINT_NOT_FOUND. Embedding the same manifest via
    // the linker covers every linked target (bins, tests, cdylib) instead; the
    // tauri-build copy is disabled so the bin doesn't get two manifests.
    let manifest =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());

    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
