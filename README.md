# Clipy

An open-source, bloat-free desktop application for downloading and editing YouTube videos in their original quality.

<img width="1872" height="1073" alt="image" src="https://github.com/user-attachments/assets/3fcacf8c-102a-4c24-aa5e-6d4cdaff5d35" />

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)
![React](https://img.shields.io/badge/React-18-blue)

## Features

### Video Downloader

- Download videos from YouTube and other supported platforms
- Choose from multiple quality options (up to 4K)
- Select video or audio-only formats
- Playlist item selection
- Download queue management with pause/resume/cancel
- Embed thumbnails and metadata
- SponsorBlock integration
- Subtitle download support
- Chapter markers

### Video Editor

- CapCut-style professional timeline interface
- Multi-track video and audio editing
- Trim, split, and merge clips
- Text overlays and auto-generated, word-timed captions (whisper.cpp)
- Video filters (brightness, contrast, saturation, hue, blur, sharpen)
- Transform controls (position, scale, rotation)
- Export to multiple formats (MP4, WebM, MKV, MOV)
- Multiple codec options (H.264, H.265, VP9, AV1)
- Hardware-accelerated encoding
- Configurable CRF quality and encoding presets

### Native Experience

- Built with Tauri 2.0 for native performance
- Small installers (about 4 MB on Windows, versus 202 MB for the Electron 1.0 build)
- System tray integration
- Native file dialogs
- Signed automatic updates
- First-run setup wizard

## Screenshots

_Coming soon_

## Installation

Download the installer for your platform from the [latest release](https://github.com/BankkRoll/clipy/releases/latest).
Clipy installs FFmpeg and yt-dlp for you on first launch, and updates itself
from then on.

| Platform | File                                                             |
| -------- | ---------------------------------------------------------------- |
| Windows  | `Clipy_<version>_x64-setup.exe` (per-user) or `_x64_en-US.msi`   |
| macOS    | `Clipy_<version>_universal.dmg` (Apple Silicon and Intel)        |
| Linux    | `Clipy_<version>_amd64.AppImage`, `_amd64.deb`, or `.x86_64.rpm` |

### Unsigned builds

Releases are not code-signed, so the OS warns on first launch:

- **Windows**: SmartScreen shows "Windows protected your PC". Choose
  **More info → Run anyway**.
- **macOS**: after copying Clipy to Applications, run
  `xattr -dr com.apple.quarantine /Applications/Clipy.app` once.

### Verifying a download

Every release asset is listed in `SHA256SUMS.txt` and carries a signed
build-provenance attestation, proving it was built by this repository's
release workflow from the tagged commit:

```bash
gh attestation verify Clipy_2.0.0_x64-setup.exe --repo BankkRoll/clipy
```

In-app updates are separately verified against Clipy's update signing key
before they are installed.

## Development

### Prerequisites

**All Platforms:**

- [Node.js](https://nodejs.org/) 20.19 or later (22 LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) latest stable
- [pnpm](https://pnpm.io/) 10 (`corepack enable` picks the pinned version)

**Windows:**

- Microsoft Visual Studio C++ Build Tools
- WebView2 (usually pre-installed on Windows 10/11)

**macOS:**

- Xcode Command Line Tools: `xcode-select --install`

**Linux (Debian/Ubuntu):**

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Linux (Fedora):**

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel
```

**Linux (Arch):**

```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl libappindicator-gtk3 librsvg
```

### Setup

1. Clone the repository:

```bash
git clone https://github.com/BankkRoll/clipy.git
cd clipy
```

2. Install dependencies:

```bash
pnpm install
```

3. Run in development mode:

```bash
pnpm tauri dev
```

### Building

Build for your platform:

```bash
pnpm tauri build
```

The built application will be in `src-tauri/target/release/bundle/`:

- **Windows**: `.exe` and `.msi` installers
- **macOS**: `.app` bundle and `.dmg` disk image
- **Linux**: `.AppImage`, `.deb`, and `.rpm` packages

### Available Scripts

```bash
pnpm dev            # Start Vite dev server
pnpm build          # Typecheck + build frontend
pnpm tauri dev      # Run Tauri in development mode
pnpm tauri build    # Build installers
pnpm lint           # ESLint (zero warnings allowed)
pnpm format         # Format with Prettier
pnpm format:check   # Check formatting
pnpm typecheck      # TypeScript type checking
pnpm test           # Frontend unit + component tests (Vitest)
pnpm test:coverage  # Frontend tests with Istanbul coverage (100% enforced)
pnpm coverage:rust  # Backend tests with llvm-cov coverage
pnpm coverage       # Both, plus a combined summary
```

### Testing

- **Frontend**: Vitest + Testing Library in jsdom. Components talk to a fake
  backend built on Tauri's official IPC mocks (`src/test/tauri.ts`), so every
  command, plugin call and event is exercised without a running app. Coverage
  is enforced at 100% statements, branches, functions and lines.
- **Backend**: `cd src-tauri && cargo test`. Real-network and real-binary
  tests (installing and checksum-verifying yt-dlp/FFmpeg/whisper, downloading
  a video, running FFmpeg exports) are opt-in:
  `cargo test -- --include-ignored`.
- **Rust coverage** needs `rustup component add llvm-tools-preview` and
  `cargo install cargo-llvm-cov`. Reports land in `coverage/`.
- **Installers**: `scripts/smoke/` installs each bundle silently, launches it
  with `CLIPY_SMOKE_TEST=1` (the app exits 0 once its UI has loaded), then
  uninstalls it. The release workflow runs these on every OS before
  publishing.

### Releasing

Push a `vX.Y.Z` tag whose version matches `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and a `CHANGELOG.md`
section. The release workflow only runs for the repository owner, re-runs the
full CI matrix, builds and smoke-tests every installer in a draft release,
then publishes it with `SHA256SUMS.txt`, provenance attestations and the
signed `latest.json` the in-app updater reads. The updater signing key lives
only in the protected `release` environment.

## Tech Stack

### Frontend

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Shadcn/ui** - UI components (Radix primitives)
- **Zustand** - State management
- **React Router** - Navigation
- **Sonner** - Toast notifications
- **Lucide React** - Icons

### Backend

- **Tauri 2.0** - Native app framework
- **Rust** - Backend language
- **SQLite** - Local database (via rusqlite)
- **FFmpeg** - Video processing
- **yt-dlp** - Video downloading

## Project Structure

```
clipy/
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── dialogs/              # App update dialog
│   │   ├── downloads/            # Download management components
│   │   ├── editor/               # Video editor components
│   │   ├── home/                 # Home page components
│   │   ├── layout/               # App layout (sidebar, command menu)
│   │   ├── library/              # Video library components
│   │   ├── onboarding/           # Setup wizard
│   │   ├── settings/             # Settings page components
│   │   └── ui/                   # Shadcn/ui base components
│   ├── hooks/                    # React hooks (Tauri API wrappers)
│   ├── lib/                      # Utilities, constants, editor logic (lib/editor)
│   ├── pages/                    # Page components
│   ├── stores/                   # Zustand stores
│   ├── styles/                   # Global CSS
│   ├── test/                     # Test harness (IPC mocks, fixtures)
│   └── types/                    # TypeScript types
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers
│   │   ├── models/               # Data models
│   │   ├── services/             # Business logic
│   │   │   ├── binary.rs         # Binary management (ffmpeg, yt-dlp)
│   │   │   ├── cache.rs          # Cache management
│   │   │   ├── captions.rs       # whisper.cpp auto-captions
│   │   │   ├── config.rs         # Configuration
│   │   │   ├── database.rs       # SQLite database
│   │   │   ├── ffmpeg.rs         # FFmpeg operations
│   │   │   ├── process_registry.rs # Process tracking for downloads
│   │   │   ├── queue.rs          # Download queue
│   │   │   └── ytdlp.rs          # yt-dlp operations
│   │   ├── media_protocol.rs     # clipy-media:// streaming for local playback
│   │   └── utils/                # Path policy, paths, logging, tray, smoke mode
│   ├── capabilities/             # Tauri capabilities (webview permissions)
│   ├── icons/                    # App icons
│   ├── tauri.conf.json           # Tauri configuration
│   └── Cargo.toml                # Rust dependencies
├── scripts/                      # Coverage, release-notes, installer smoke tests
├── public/                       # Static assets
├── CHANGELOG.md
└── package.json                  # Node.js dependencies
```

## Configuration

Clipy stores its settings (`config.json`), library database, downloaded
tools (FFmpeg, yt-dlp, whisper) and caches in:

- **Windows**: `%APPDATA%\com.clipy.app`
- **macOS**: `~/Library/Application Support/com.clipy.app`
- **Linux**: `~/.local/share/com.clipy.app`

Logs are kept for 7 days in:

- **Windows**: `%LOCALAPPDATA%\Clipy\logs`
- **macOS**: `~/Library/Application Support/Clipy/logs`
- **Linux**: `~/.local/share/Clipy/logs`

## Security

- Downloaded tools are verified against published SHA-256 checksums before
  they are installed.
- The UI can only reach the backend through a fixed set of commands; every
  file path it sends is validated, and the webview has no direct file-system,
  shell or network access beyond opening links in your browser.
- Report vulnerabilities privately through
  [GitHub security advisories](https://github.com/BankkRoll/clipy/security/advisories/new).

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Video downloading
- [FFmpeg](https://ffmpeg.org/) - Video processing
- [Tauri](https://tauri.app/) - Desktop app framework
- [Shadcn/ui](https://ui.shadcn.com/) - UI components
- [Radix UI](https://www.radix-ui.com/) - UI primitives

## Support

If you find this project helpful, please consider:

- Starring the repository
- Reporting bugs or suggesting features
- Contributing code or documentation

---

Made with love by [BankkRoll](https://github.com/BankkRoll)
