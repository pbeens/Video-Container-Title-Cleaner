# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-01
### Added
- In-app Support and Buy Me a Coffee buttons that open approved external links.
- App/window icon wiring for runtime and packaged builds (Windows `.ico` and macOS `.icns`).
- Auto-inspection immediately after drag-and-drop.
- Scan summary in status line showing counts for files with titles and without titles.
- Live per-file removal updates with in-list status messages and active-row highlighting.
- Stop Processing button during removal with backend cancellation support.

### Changed
- Removed native Electron application menu.
- Window title now includes app version (e.g., `v0.2.0`).
- Main results panel now fills available window height.
- Checkbox behavior updated to filter list items with no detected container title (default off).
- UI guidance improvements with pulsing cues for idle drop zone, inspect status, and post-scan remove action.
- README refreshed for release links, support links, and v0.2 scope.

## [0.1.0] - 2026-03-01
### Added
- Initial Electron desktop app scaffold with secure renderer bridge (`contextIsolation` and sandboxed renderer).
- Drag-and-drop support for video files and folders.
- Recursive folder scanning for supported video extensions.
- Container title inspection per file via `ffprobe`.
- In-place container title removal workflow with temporary-file replacement.
- Build/test scripts for Windows and macOS packaging and JavaScript syntax validation.
