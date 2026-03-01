# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-01
### Added
- Initial Electron desktop app scaffold with secure renderer bridge (`contextIsolation` and sandboxed renderer).
- Drag-and-drop support for video files and folders.
- Recursive folder scanning for supported video extensions.
- Container title inspection per file via `ffprobe`.
- In-place container title removal workflow with temporary-file replacement.
- Build/test scripts for Windows and macOS packaging and JavaScript syntax validation.
