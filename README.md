<div align="center">
  <h1>Clipy</h1>
  <p><strong>Professional YouTube video downloader & editor. 100% free, open-source, and privacy-focused.</strong></p>

  <img src="https://github.com/user-attachments/assets/1741878b-b407-4e6e-a901-5eac6f38d277" alt="Clipy Demo" width="800"/>

  <p>
    <a href="#features">Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#contributing">Contributing</a> •
    <a href="#license">License</a>
  </p>
</div>

---

**Clipy** is a fully open-source, bloat-free Electron desktop application for downloading and editing YouTube videos in their **original quality** without compression or re-encoding. It provides a clean, advanced, and completely free alternative to proprietary tools, with a strong emphasis on user privacy and a high-quality user experience.

All processing is done locally on your machine. We use **yt-dlp** for reliable video downloading and **FFmpeg** for video processing, ensuring maximum compatibility and quality.

> **Note:** This project is currently under active development. Some features may be incomplete or subject to change.

## Features

### Core Features

- **High-Quality Downloads**: Download videos up to 4K/2160p in original quality with no re-encoding
- **Dual-Stream Preview**: Preview videos in 1080p+ quality with synchronized audio before downloading
- **Built-in Video Editor**: Trim and clip videos with a professional timeline interface
- **Quality Selection**: Choose your preferred quality (4K, 1440p, 1080p, 720p, etc.) - downloads respect your choice
- **Multiple Formats**: Export to MP4, WebM, MKV, or audio-only formats (MP3, M4A, Opus)

### Privacy & Security

- **100% Local Processing**: All video processing happens on your machine
- **No Telemetry**: Zero tracking, analytics, or data collection
- **No Accounts Required**: Just paste a URL and download
- **Sandboxed Architecture**: Secure Electron setup with context isolation and strict CSP

### User Experience

- **Modern UI**: Clean, responsive interface built with React and Shadcn UI
- **Dark/Light Themes**: Full theme support with system theme detection
- **Download Queue**: Manage multiple downloads with pause, resume, and retry
- **Download History**: Track all your downloads with easy access to files
- **Cross-Platform**: Native experience on Windows, macOS, and Linux

## Comparison

| Feature | **Clipy** | **cliply.space** | **yt-dlp CLI** | **4K Video Downloader** |
|---------|-----------|------------------|----------------|-------------------------|
| **Cost** | 100% Free | Freemium/Paywall | Free | Paid |
| **UI/UX** | Modern React UI | Basic Electron | CLI Only | Desktop Native |
| **Video Preview** | 1080p+ with Audio | Basic | None | Basic |
| **Built-in Editor** | Timeline + Trim | None | None | Limited |
| **Max Quality** | 4K/Original | Original | 4K/Original | 4K (Re-encoded) |
| **Dual-Stream** | Yes (Synced A/V) | No | N/A | No |
| **Privacy** | 100% Local | 100% Local | 100% Local | Cloud features |
| **Platforms** | Win/Mac/Linux | Win/Mac | All | Win/Mac |
| **Open Source** | Yes (MIT) | Yes (GNU) | Yes (Unlicense) | No |

## Installation

### Download Pre-built Binaries

1. Go to the [**Releases**](https://github.com/BankkRoll/clipy/releases) page
2. Download the installer for your OS:
   - **Windows**: `.exe` installer
   - **macOS**: `.dmg` disk image
   - **Linux**: `.deb` (Debian/Ubuntu) or `.rpm` (Fedora/RHEL)
3. Run the installer and launch Clipy

### Build from Source

```bash
# Clone the repository
git clone https://github.com/BankkRoll/clipy.git
cd clipy

# Install dependencies
pnpm install

# Run in development mode
pnpm start

# Package the app (creates unpackaged build)
pnpm package

# Build distributable installers (.exe, .dmg, .deb, etc.)
pnpm make
```

## Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type-safe development
- **TanStack Router** - File-based routing
- **Zustand** - State management
- **Tailwind CSS** - Utility-first styling
- **Shadcn UI** - Accessible component library
- **i18next** - Internationalization

### Backend
- **Electron** - Cross-platform desktop framework
- **yt-dlp** - Video downloading engine
- **FFmpeg** - Video processing and conversion
- **HLS.js** - Adaptive streaming support

### Architecture
- **IPC Channels** - Secure main/renderer communication
- **Context Bridge** - Safe API exposure to renderer
- **Sandboxed Renderer** - Enhanced security model
- **Custom Protocol** - Secure local file serving (`clipy-file://`)

## How It Works

### Dual-Stream High-Quality Preview

YouTube limits combined audio+video streams to ~720p. For higher quality preview:

1. **Video Stream**: Clipy fetches the highest quality video-only stream (1080p, 1440p, or 4K)
2. **Audio Stream**: A separate high-bitrate audio stream is loaded
3. **Synchronization**: Both streams play in sync with shared controls (play, pause, seek, volume)
4. **Result**: Full 1080p+ preview with audio before you download

### Download Quality

When you select a quality (e.g., 4K), Clipy:
1. Uses yt-dlp format selectors to fetch that exact quality
2. Downloads video and audio streams separately
3. Muxes them together using FFmpeg
4. Outputs the final file in your chosen format

## Project Structure

```
src/
├── components/        # React components
│   ├── downloader/   # Download-related components
│   ├── editor/       # Video editor (player, timeline)
│   ├── library/      # Download history
│   └── ui/           # Shadcn UI components
├── hooks/            # Custom React hooks
├── ipc/              # Electron IPC handlers
│   ├── channels.ts   # IPC channel definitions
│   ├── context-bridge.ts  # Secure API bridge
│   └── *-handlers.ts # Handler implementations
├── pages/            # Route pages
├── services/         # Backend services
│   ├── downloader/   # yt-dlp integration
│   └── *.ts          # Other services
├── stores/           # Zustand stores
├── types/            # TypeScript definitions
└── utils/            # Utility functions
```

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/clipy.git`
3. **Create a branch**: `git checkout -b feature/amazing-feature`
4. **Make changes** and test thoroughly
5. **Commit**: `git commit -m "Add amazing feature"`
6. **Push**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style (Prettier + ESLint)
- Write meaningful commit messages
- Test on multiple platforms if possible
- Update documentation for new features

## Acknowledgements

This project is built on the shoulders of giants:

- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** - The powerful video downloading engine
- **[FFmpeg](https://ffmpeg.org/)** - Industry-standard video processing
- **[Electron](https://www.electronjs.org/)** - Cross-platform desktop framework
- **[electron-shadcn](https://github.com/LuanRoger/electron-shadcn)** - Modern Electron template
- **[Shadcn UI](https://ui.shadcn.com/)** - Beautiful, accessible components
- **[React](https://react.dev/)**, **[Vite](https://vitejs.dev/)**, **[TypeScript](https://www.typescriptlang.org/)** - Development stack
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework

## License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

