# Clipy

An open-source, bloat-free desktop application for downloading and editing YouTube videos in their original quality.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)
![React](https://img.shields.io/badge/React-18-blue)

## Features

### Video Downloader

- Download videos from YouTube and other supported platforms
- Choose from multiple quality options (up to 4K)
- Select video or audio-only formats
- Batch download support
- Download queue management with pause/resume/cancel
- Embed thumbnails and metadata
- SponsorBlock integration
- Subtitle download support
- Chapter markers

### Video Editor

- CapCut-style professional timeline interface
- Multi-track video and audio editing
- Trim, split, and merge clips
- Text overlays and captions
- Video filters (brightness, contrast, saturation, hue, blur, sharpen)
- Transform controls (position, scale, rotation)
- Export to multiple formats (MP4, WebM, MKV, MOV)
- Multiple codec options (H.264, H.265, VP9, AV1)
- Hardware-accelerated encoding
- Configurable CRF quality and encoding presets

### Native Experience

- Built with Tauri 2.0 for native performance
- Small installer size (~10MB vs 150MB for Electron)
- System tray integration
- Native file dialogs and notifications
- Auto-updates
- First-run setup wizard

## Screenshots

_Coming soon_

## Installation

### Windows

Download the latest `.msi` or `.exe` installer from the [Releases](https://github.com/BankkRoll/clipy/releases) page.

### macOS

Download the latest `.dmg` file from the [Releases](https://github.com/BankkRoll/clipy/releases) page.

### Linux

Download the latest `.AppImage` or `.deb` package from the [Releases](https://github.com/BankkRoll/clipy/releases) page.

## Development

### Prerequisites

**All Platforms:**

- [Node.js](https://nodejs.org/) v18 or later
- [Rust](https://www.rust-lang.org/tools/install) latest stable
- [pnpm](https://pnpm.io/) (recommended) or npm

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
pnpm dev          # Start Vite dev server
pnpm build        # Build frontend
pnpm tauri dev    # Run Tauri in development mode
pnpm tauri build  # Build Tauri application
pnpm lint         # Run ESLint
pnpm lint:fix     # Fix ESLint issues
pnpm format       # Format code with Prettier
pnpm typecheck    # Run TypeScript type checking
```

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
│   │   ├── dialogs/              # Error and status dialogs
│   │   ├── downloads/            # Download management components
│   │   ├── editor/               # Video editor components
│   │   ├── home/                 # Home page components
│   │   ├── layout/               # App layout (sidebar, command menu)
│   │   ├── library/              # Video library components
│   │   ├── onboarding/           # Setup wizard
│   │   ├── settings/             # Settings page components
│   │   └── ui/                   # Shadcn/ui base components
│   ├── hooks/                    # React hooks (Tauri API wrappers)
│   ├── lib/                      # Utilities and constants
│   ├── pages/                    # Page components
│   ├── stores/                   # Zustand stores
│   ├── styles/                   # Global CSS
│   └── types/                    # TypeScript types
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers
│   │   ├── models/               # Data models
│   │   ├── services/             # Business logic
│   │   │   ├── binary.rs         # Binary management (ffmpeg, yt-dlp)
│   │   │   ├── cache.rs          # Cache management
│   │   │   ├── config.rs         # Configuration
│   │   │   ├── database.rs       # SQLite database
│   │   │   ├── ffmpeg.rs         # FFmpeg operations
│   │   │   ├── process_registry.rs # Process tracking for downloads
│   │   │   ├── queue.rs          # Download queue
│   │   │   └── ytdlp.rs          # yt-dlp operations
│   │   └── utils/                # Utility functions
│   ├── capabilities/             # Tauri capabilities
│   ├── icons/                    # App icons
│   └── Cargo.toml                # Rust dependencies
├── public/                       # Static assets
├── package.json                  # Node.js dependencies
└── tauri.conf.json               # Tauri configuration
```

## Configuration

Clipy stores its configuration and data in:

- **Windows**: `%APPDATA%\Clipy`
- **macOS**: `~/Library/Application Support/Clipy`
- **Linux**: `~/.config/Clipy`

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
