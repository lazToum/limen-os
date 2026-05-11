# Contributing to Limen OS

Limen OS is early-stage and the architecture is still shifting. The best
contributions right now are bug reports, compatibility fixes, and small
focused improvements — not large feature additions.

## Before you start

Open an issue first if you want to add a feature or change something
architectural. The shell, AI router, and voice pipeline are evolving quickly
and a PR built on an outdated assumption wastes both our time.

## Development setup

See [DEVELOPER.md](DEVELOPER.md) for the full setup guide. The short version:

```bash
git clone https://github.com/lazToum/limen-os
cd limen-os
make setup   # installs Rust, Bun, Flutter deps
make dev     # Tauri shell + TUI watcher
```

## Code style

- **Rust** — `cargo fmt` and `cargo clippy --all-targets` must pass with no warnings.
- **TypeScript/React** — `bun run lint` (ESLint) must pass.
- **Dart/Flutter** — `dart format` and `flutter analyze` must pass.
- **Commit messages** — imperative present tense, 72-char subject line.
  Prefix with the affected area: `tauri:`, `voice:`, `ai:`, `tui:`, `ui:`, `docs:`, `chore:`.

## Pull requests

1. Fork the repo, create a branch from `main`.
2. Make your changes; keep them focused (one concern per PR).
3. Run `make check` (runs fmt + clippy + lint) before pushing.
4. Open the PR against `main` with a clear description of what and why.
5. PRs touching the Tauri IPC surface or AI router need a brief test
   description — automated tests are sparse right now, so explain how
   you verified the behavior manually.

## Identifiers

All session, event, and plugin action IDs must use `@waldiez/wid`.
Do not introduce `uuid`, `Date.now()`, `nanoid`, or similar alternatives.
See [waldiez/wid](https://github.com/waldiez/wid) for usage.

## License

By submitting a pull request you agree that your contribution is licensed
under the MIT License and the Apache License 2.0, consistent with the
project's [LICENSE](LICENSE).
