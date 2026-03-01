# Video Container Title Cleaner

Electron desktop app for loading videos (or whole folders), scanning recursively, and inspecting/removing the container `title` property.

## Current Scope (v0.1)
- Drag and drop files or folders into the UI.
- Recursively discover supported video files in dropped folders.
- Inspect and display container title per file using `ffprobe`.
- Remove container title in-place on the original file.

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

## Validation Runs (No GUI)
Use this command for JavaScript syntax validation only.

### Windows (PowerShell or CMD)
```bash
npm run test
```

### macOS (Terminal / zsh)
```bash
npm run test
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

## Next Iteration Ideas
1. Add optional in-app operation log panel for removal output paths and errors.
2. Add backup/location preferences and overwrite safeguards in settings.
3. Add selection filters and search for larger batches.
