# Contributing to Clipy

First off, thank you for considering contributing to Clipy! It's people like you that make open-source projects like this thrive. We welcome contributions of all kinds, from bug reports and feature suggestions to code contributions.

## How to Contribute

-   **Reporting Bugs**: If you find a bug, please create an issue in our [issue tracker](https://github.com/BankkRoll/clipy/issues). Include as much detail as possible, such as steps to reproduce, your operating system, and the app version.
-   **Suggesting Enhancements**: If you have an idea for a new feature or an improvement to an existing one, please create an issue to start a discussion.
-   **Pull Requests**: We actively welcome your pull requests.

## Development Setup

To get started with the development environment, please follow these steps:

1.  **Fork and Clone the Repository**
    ```bash
    git clone https://github.com/YOUR_USERNAME/clipy.git
    cd clipy
    ```

2.  **Install Dependencies**
    We use `pnpm` for package management.
    ```bash
    pnpm install
    ```

3.  **Run the Development Server**
    This command starts the Vite development server with hot reloading for the renderer process.
    ```bash
    pnpm start
    ```

## Project Structure

Our project is built on a modern Electron stack, and understanding its structure is key to contributing effectively.

```
src/
├── main.ts         # Main process entry point
├── preload.ts      # Securely exposes IPC to the renderer
├── renderer.ts     # Renderer process entry point
│
├── components/     # React UI components (built with Shadcn UI)
├── pages/          # Top-level page components for each route
├── routes/         # TanStack Router configuration
│
├── helpers/
│   ├── ipc/        # All IPC channel definitions, contexts, and listeners
│   ├── downloader/ # Core download logic (yt-dlp, youtubei.js)
│   └── editor/     # Core editor logic (FFmpeg)
│
├── types/          # All TypeScript type definitions
├── localization/   # i18n translation files
└── styles/         # Global styles and Tailwind CSS config
```

### IPC (Inter-Process Communication)

All communication between the main process (Node.js) and the renderer process (React UI) happens through a secure IPC system. When adding new functionality, please follow the existing patterns:

1.  **Channels**: Define your channel names in `src/helpers/ipc/[feature]/[feature]-channels.ts`.
2.  **Context**: Expose the function to the renderer in `src/helpers/ipc/[feature]/[feature]-context.ts`.
3.  **Listeners**: Implement the main process logic in `src/helpers/ipc/[feature]/[feature]-listeners.ts`.

This pattern ensures security and type safety across the application.

## Pull Request Process

1.  Ensure any new dependencies are added to `package.json`.
2.  Update the `README.md` with details of changes to the interface, if applicable.
3.  Increase the version numbers in any necessary files.
4.  Your pull request will be reviewed by a maintainer, who may request changes.

Thank you again for your interest in contributing! 