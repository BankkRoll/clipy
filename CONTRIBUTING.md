# Contributing to Clipy

First off, thank you for considering contributing to Clipy! It's people like you that make Clipy such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed after following the steps**
- **Explain which behavior you expected to see instead and why**
- **Include screenshots and animated GIFs if possible**
- **Include your OS version and Clipy version**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description of the suggested enhancement**
- **Provide specific examples to demonstrate the steps**
- **Describe the current behavior and explain which behavior you expected to see instead**
- **Explain why this enhancement would be useful**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Setup

### Prerequisites

- Node.js 18+
- Rust (latest stable)
- pnpm (recommended)

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/clipy.git
cd clipy

# Install dependencies
pnpm install

# Start development server
pnpm tauri dev
```

### Project Structure

```
clipy/
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── dialogs/              # Error and status dialogs
│   │   ├── downloads/            # Download management
│   │   ├── editor/               # Video editor
│   │   ├── home/                 # Home page
│   │   ├── layout/               # App layout
│   │   ├── library/              # Video library
│   │   ├── onboarding/           # Setup wizard
│   │   ├── settings/             # Settings
│   │   └── ui/                   # Base UI components
│   ├── hooks/                    # React hooks
│   ├── lib/                      # Utilities
│   ├── pages/                    # Page components
│   ├── stores/                   # Zustand stores
│   ├── styles/                   # Global CSS
│   └── types/                    # TypeScript types
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers
│   │   ├── models/               # Data models
│   │   ├── services/             # Business logic
│   │   └── utils/                # Utility functions
│   └── Cargo.toml                # Rust dependencies
└── package.json                  # Node.js dependencies
```

### Code Style

#### TypeScript/React

- Use TypeScript for all new code
- Use functional components with hooks
- Follow the existing code style
- Use meaningful variable and function names
- Use Shadcn/ui components when possible
- Follow Tailwind CSS conventions

#### Rust

- Follow Rust conventions and idioms
- Use `cargo fmt` before committing
- Use `cargo clippy` to catch common mistakes
- Add doc comments to public functions

### Linting and Formatting

```bash
# Lint TypeScript/React
pnpm lint
pnpm lint:fix

# Format code
pnpm format

# Type check
pnpm typecheck

# Format Rust code
cd src-tauri && cargo fmt

# Lint Rust code
cd src-tauri && cargo clippy
```

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

Examples:

- `Add video trimming feature`
- `Fix download progress not updating`
- `Update README with new screenshots`

### Testing

```bash
# Run frontend tests
pnpm test

# Run Rust tests
cd src-tauri && cargo test
```

## Questions?

Feel free to open an issue with the question label or reach out to the maintainers.

Thank you for contributing!
