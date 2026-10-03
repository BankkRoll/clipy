# Contributing to Clipy

First off, thank you for considering contributing to Clipy! It's people like you that make Clipy such a great tool.

## Code of Conduct

Be respectful and constructive. Harassment or personal attacks in issues,
pull requests or discussions aren't tolerated.

## Security Issues

Please don't open public issues for vulnerabilities. Report them privately as
described in [SECURITY.md](SECURITY.md).

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
2. Add tests for any code you add or change (see [Testing](#testing); the
   frontend coverage gate is 100%)
3. If you've changed user-facing behavior, update the README and add a line to
   the `Unreleased` section of `CHANGELOG.md`
4. Run the checks listed under [Before you open a PR](#before-you-open-a-pr)
5. Open the pull request. CI must pass on Windows, macOS and Linux

## Development Setup

### Prerequisites

- Node.js 20.19+ (22 LTS recommended)
- Rust (latest stable)
- pnpm 10 (`corepack enable` picks the version pinned in `package.json`)
- Platform packages for Tauri, listed in the
  [README](README.md#prerequisites)

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
│   │   ├── dialogs/              # App update dialog
│   │   ├── downloads/            # Download management
│   │   ├── editor/               # Video editor
│   │   ├── home/                 # Home page
│   │   ├── layout/               # App layout
│   │   ├── library/              # Video library
│   │   ├── onboarding/           # Setup wizard
│   │   ├── settings/             # Settings
│   │   └── ui/                   # Base UI components
│   ├── hooks/                    # React hooks
│   ├── lib/                      # Utilities; pure editor logic in lib/editor
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
│   │   └── utils/                # Path policy, paths, logging, tray
│   └── Cargo.toml                # Rust dependencies
├── e2e/                          # Local end-to-end tests (WebdriverIO)
├── scripts/                      # Coverage, release and smoke-test scripts
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

- **Frontend** (`pnpm test`): Vitest + Testing Library. Render components
  against the fake backend in `src/test/tauri.ts` (`mockBackend`,
  `emitBackendEvent`) instead of mocking `@tauri-apps/*` modules. Coverage
  must stay at 100% statements, branches, functions and lines.
- **Backend** (`cd src-tauri && cargo test`): put pure logic in plain
  functions and test them directly; `src/lib.rs` has a mock Tauri app and
  fake-tool helpers for commands and process code. Line coverage must stay
  at or above 95%.
- **Real network and tools** (opt-in):
  `cd src-tauri && cargo test -- --include-ignored`.
- **End to end** (local only, never in CI): build with
  `pnpm tauri build --debug --no-bundle`, install `tauri-driver`
  (`cargo install tauri-driver --locked`) and a matching Edge WebDriver on
  Windows, then run `pnpm e2e`. It expects a fresh profile.

### Before you open a PR

These are the same checks CI runs:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:coverage
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

## Questions?

Feel free to open an issue with the question label or reach out to the maintainers.

Thank you for contributing!
