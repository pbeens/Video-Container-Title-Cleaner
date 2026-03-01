# Video Container Title Cleaner

![Video Container Title Cleaner Screenshot](Images/Video%20Cleaner%20Title%20Container%20v0.2.0.jpg)

Electron desktop app for loading videos (or whole folders), scanning recursively, and inspecting/removing the container `title` property.

## Support
- Report bugs or request features: https://github.com/pbeens/Video-Container-Title-Cleaner/issues
- Support development: https://www.buymeacoffee.com/pbeens

Download the latest macOS and Windows builds from the [Releases page](https://github.com/pbeens/Video-Container-Title-Cleaner/releases).

## Current Scope (v0.2)
- Drag and drop files or folders into the UI.
- Recursively discover supported video files in dropped folders.
- Automatically inspect after dropping files/folders.
- Inspect and display container title per file using `ffprobe`.
- Show scan summary counts (titles found vs none).
- Remove container title in-place on the original file.
- Show per-file removal progress, auto-scroll to active file, and immediate per-file status updates.
- Stop active removal safely, including temporary file cleanup.
- Optional list filter to hide videos with no detected container title.

## Tech Stack
- Electron
- Vanilla HTML/CSS/JS renderer
- `ffprobe-static` for bundled ffprobe binary access

## Project Structure
- `src/main.js`: Electron main process, IPC handlers, recursive scanning, ffprobe execution.
- `src/preload.js`: Safe API bridge (`window.appApi`) to renderer.
- `src/renderer/index.html`: App shell and UI.
- `src/renderer/styles.css`: Layout and styling.
- `src/renderer/renderer.js`: Drag/drop logic, rendering, and button actions.
- `GEMINI.md`: Program brief + implementation instructions for AI-assisted workflows.

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the GUI app:
   ```bash
   npm start
   ```
   Alternative:
   ```bash
   npm run dev
   ```

## Test Runs (Open GUI)
For test runs, launch the GUI app.

### Windows (PowerShell or CMD)
```bash
npm start
```

### macOS (Terminal / zsh)
```bash
npm start
```

## Build Instructions
Build outputs are written to the `release/` directory.

### Windows Build (run on Windows)
```bash
npm run build:win
```

### macOS Build (run on macOS)
```bash
npm run build:mac
```

### Notes on Cross-Platform Builds
- Build on the target OS when possible (Windows on Windows, macOS on macOS).
- Electron packaging/signing requirements may vary by platform and certificate setup.

## Notes
- Supported video extensions are defined in `src/main.js` (`VIDEO_EXTENSIONS`).
- Container title removal updates the original file in-place.
- The app uses a temporary working file internally and then replaces the original.
- Files with no container title are automatically skipped during removal.
- The app is configured with `contextIsolation: true`, `sandbox: true`, and no renderer `nodeIntegration`.
