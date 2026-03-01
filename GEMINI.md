# GEMINI.md

## Program Description
Video Container Title Cleaner is a desktop Electron app aimed at privacy cleanup for video files, focused on container `title` first.

Primary workflow:
1. User drags and drops one or more video files, or a folder.
2. If a folder is provided, the app recursively scans all subfolders for supported video extensions.
3. The app inspects each discovered video and shows container title in a scrollable review pane.
4. User confirms what should be removed (future phase).
5. App removes container title in-place on the original file.

Current build status:
- Implemented: input selection, recursive scan, container title inspection, and in-place container title removal.

## Specific Instructions
- Keep `contextIsolation` enabled and expose renderer capabilities only via `preload.js`.
- Avoid direct shelling from the renderer process.
- Preserve recursive folder traversal behavior.
- Keep the results view responsive for larger file lists (do not block UI thread with heavy synchronous work).
- When implementing removal:
  - Default to non-destructive behavior (new file or backup mode).
  - Provide clear per-file status and errors.
  - Never overwrite files silently.
- Maintain Windows-first compatibility, but keep cross-platform paths and process handling where possible.
- Use straightforward dependencies and avoid heavy frameworks unless needed.

## Code Conventions
- Keep source under `src/` with `main`, `preload`, and `renderer` separation.
- Prefer small utility functions for scan/inspect/remove pipelines.
- Preserve readable, minimal UI with a clear status line and actionable buttons.
