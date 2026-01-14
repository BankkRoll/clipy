> [!IMPORTANT]
> This tool was never finished the current state is not done. Tool doesnt currently work, feel free to fork and check it out. But current state is not 100% working. Maybe will get around to finishing now that its been shared and has alot of stars coming in lol

<div align="center">
  <h1>Clipy</h1>
  <p><strong>Professional YouTube video downloader and editor. 100% free, open-source, and privacy-focused.</strong></p>

  <img src="https://github.com/user-attachments/assets/1741878b-b407-4e6e-a901-5eac6f38d277" alt="Clipy Demo" width="800"/>
</div>

---

**Clipy** is a fully open-source, bloat-free Electron desktop application for downloading and editing YouTube videos in their **original quality** without compression or re-encoding. It provides a clean, advanced, and completely free alternative to proprietary tools, with a strong emphasis on user privacy and a high-quality user experience.

All processing is done locally on your machine. We use the modern InnerTube API for fetching video information first, with a fallback to `ytdl-core`, ensuring reliability and speed without compromising your privacy.

## Features

-   **Original Quality Downloads**: Download videos in the highest quality available with no re-encoding.
-   **Built-in Video Editor**: A timeline-based editor powered by FFmpeg for lossless trimming, splitting, and merging.
-   **100% Privacy Focused**: All processing is done locally. No servers, no tracking, no telemetry.
-   **Completely Free & Open Source**: No ads, no paywalls, no premium features. Licensed under the MIT license.
-   **Cross-Platform**: A single, consistent experience on Windows, macOS, and Linux.
-   **Modern UI**: Built with React, TypeScript, and Shadcn UI for a clean and responsive interface with full theme support.

## Us vs. The Alternatives

| Feature          | **Clipy**             | **cliply.space** | **yt-dlp CLI** | **4K Video Downloader** |
| ---------------- | --------------------- | ---------------- | -------------- | ----------------------- |
| **Cost**         | 100% Free             | Freemium/Paywall | Free           | Paid                    |
| **UI/UX**        | Modern React UI       | Basic Electron   | CLI Only       | Desktop Native          |
| **Editor**       | Built-in Timeline     | None             | None           | Limited                 |
| **Quality**      | Original/Lossless     | Original         | Original       | Re-encoded              |
| **Platforms**    | Win/Mac/Linux         | Win/Mac          | All            | Win/Mac                 |
| **Open Source**  | ✅ Yes (MIT)          | ❌ No            | ✅ Yes         | ❌ No                   |

## Getting Started

1.  Head over to the [**Releases**](https://github.com/BankkRoll/clipy/releases) page.
2.  Download the latest installer for your operating system (`.exe` for Windows, `.dmg` for macOS, `.deb` or `.rpm` for Linux).
3.  Run the installer and launch the application.

## Contributing

We welcome contributions from everyone! If you're interested in helping improve Clipy, please check out our [**Contributing Guide**](./CONTRIBUTING.md) to get started.

## Acknowledgements

This project would not be possible without the incredible work of the open-source community. We extend our sincere thanks to the following projects and their contributors:

-   **[LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn)** for the robust and modern Electron template.
-   **[youtubei.js](https://github.com/LuanRT/YouTube.js)** for providing access to YouTube's InnerTube API.
-   **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** and **[ytdl-core](https://github.com/fent/node-ytdl-core)** for the powerful download capabilities.
-   **[FFmpeg](https://ffmpeg.org/)** for the unparalleled video processing power.
-   **[React](https://react.dev/)**, **[Vite](https://vitejs.dev/)**, **[TypeScript](https://www.typescriptlang.org/)**, and **[Tailwind CSS](https://tailwindcss.com/)** for the incredible development experience.
-   **[Shadcn UI](https://ui.shadcn.com/)** for the fantastic unstyled component library.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
