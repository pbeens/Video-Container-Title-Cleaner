const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.wmv', '.flv',
  '.mpg', '.mpeg', '.3gp', '.mts', '.m2ts', '.ts', '.ogv'
]);

const ALLOWED_EXTERNAL_URLS = new Set([
  'https://github.com/pbeens/Video-Container-Title-Cleaner/issues',
  'https://www.buymeacoffee.com/pbeens'
]);
const activeRemovalJobs = new Map();
const canceledRemovalJobs = new Set();

function createWindow() {
  const appTitle = `Video Container Title Cleaner v${app.getVersion()}`;
  const windowIcon = path.join(__dirname, '..', 'build', 'icons', 'app.ico');
  const win = new BrowserWindow({
    title: appTitle,
    icon: windowIcon,
    width: 1200,
    height: 850,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#f2f4f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.on('page-title-updated', (event) => event.preventDefault());
  win.webContents.on('did-finish-load', () => {
    win.setTitle(appTitle);
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function addActiveRemovalProcess(jobId, processEntry) {
  if (!jobId) {
    return;
  }

  const entries = activeRemovalJobs.get(jobId) || new Set();
  entries.add(processEntry);
  activeRemovalJobs.set(jobId, entries);
}

function removeActiveRemovalProcess(jobId, processEntry) {
  if (!jobId) {
    return;
  }

  const entries = activeRemovalJobs.get(jobId);
  if (!entries) {
    return;
  }

  entries.delete(processEntry);
  if (entries.size === 0) {
    activeRemovalJobs.delete(jobId);
  }
}

function isRemovalJobCanceled(jobId) {
  return Boolean(jobId) && canceledRemovalJobs.has(jobId);
}

async function cancelRemovalJob(jobId) {
  if (!jobId) {
    return { canceled: false, cleanedTempFiles: 0 };
  }

  canceledRemovalJobs.add(jobId);
  const entries = activeRemovalJobs.get(jobId);
  if (!entries || entries.size === 0) {
    return { canceled: true, cleanedTempFiles: 0 };
  }

  const cleanupTasks = [];
  let cleanedTempFiles = 0;

  for (const entry of Array.from(entries)) {
    entry.canceled = true;
    try {
      entry.proc.kill();
    } catch {
      // no-op
    }

    if (entry.tempOutputPath) {
      cleanedTempFiles += 1;
      cleanupTasks.push(fs.rm(entry.tempOutputPath, { force: true }).catch(() => {}));
    }
  }

  await Promise.all(cleanupTasks);
  return { canceled: true, cleanedTempFiles };
}

async function safeStat(inputPath) {
  try {
    return await fs.stat(inputPath);
  } catch {
    return null;
  }
}

async function collectVideosRecursively(rootPath, output = []) {
  let entries;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return output;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await collectVideosRecursively(fullPath, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext)) {
      output.push(fullPath);
    }
  }

  return output;
}

function runFfprobe(filePath) {
  return new Promise((resolve) => {
    const ffprobePath = ffprobeStatic.path;
    if (!ffprobePath) {
      resolve({
        filePath,
        fileName: path.basename(filePath),
        formatTitle: null,
        error: 'ffprobe binary was not found.'
      });
      return;
    }

    const args = [
      '-v', 'error',
      '-show_entries', 'format_tags=title',
      '-of', 'json',
      filePath
    ];

    const proc = spawn(ffprobePath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => {
      resolve({
        filePath,
        fileName: path.basename(filePath),
        formatTitle: null,
        error: error.message
      });
    });

    proc.on('close', () => {
      try {
        const parsed = JSON.parse(stdout || '{}');
        const formatInfo = parsed.format || {};

        resolve({
          filePath,
          fileName: path.basename(filePath),
          formatTitle: formatInfo.tags?.title || null,
          error: stderr.trim() || null
        });
      } catch (error) {
        resolve({
          filePath,
          fileName: path.basename(filePath),
          formatTitle: null,
          error: `Failed to parse ffprobe output: ${error.message}`
        });
      }
    });
  });
}

async function nextAvailableOutputPath(inputPath) {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  let attempt = 0;

  while (attempt < 9999) {
    const suffix = attempt === 0 ? '_no_container_title' : `_no_container_title_${attempt}`;
    const candidate = path.join(dir, `${base}${suffix}${ext}`);
    const exists = await safeStat(candidate);
    if (!exists) {
      return candidate;
    }
    attempt += 1;
  }

  throw new Error('Failed to find an available output file name.');
}

function removeContainerTitleFromFile(inputPath, outputPath, options = {}) {
  const jobId = typeof options.jobId === 'string' ? options.jobId : null;

  return new Promise((resolve) => {
    if (isRemovalJobCanceled(jobId)) {
      resolve({
        inputPath,
        outputPath: null,
        success: false,
        canceled: true,
        error: 'Operation canceled by user.'
      });
      return;
    }

    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) {
      resolve({
        inputPath,
        outputPath,
        success: false,
        error: 'ffmpeg binary was not found.'
      });
      return;
    }

    const args = [
      '-y',
      '-i', inputPath,
      '-map', '0',
      '-c', 'copy',
      '-map_metadata', '0',
      '-metadata', 'title=',
      outputPath
    ];

    const proc = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    const processEntry = { proc, tempOutputPath: outputPath, canceled: false };
    addActiveRemovalProcess(jobId, processEntry);

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => {
      removeActiveRemovalProcess(jobId, processEntry);
      resolve({
        inputPath,
        outputPath,
        success: false,
        canceled: processEntry.canceled || isRemovalJobCanceled(jobId),
        error: error.message
      });
    });

    proc.on('close', (code) => {
      removeActiveRemovalProcess(jobId, processEntry);
      const canceled = processEntry.canceled || isRemovalJobCanceled(jobId);
      resolve({
        inputPath,
        outputPath: canceled ? null : outputPath,
        success: !canceled && code === 0,
        canceled,
        error: canceled ? 'Operation canceled by user.' : (code === 0 ? null : (stderr.trim() || `ffmpeg exited with code ${code}`))
      });
    });
  });
}

async function removeContainerTitleInPlace(inputPath, options = {}) {
  const jobId = typeof options.jobId === 'string' ? options.jobId : null;
  if (isRemovalJobCanceled(jobId)) {
    return {
      inputPath,
      outputPath: null,
      success: false,
      canceled: true,
      error: 'Operation canceled by user.'
    };
  }

  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const tempOutputPath = await nextAvailableOutputPath(path.join(dir, `${base}.__temp__${ext}`));
  const backupPath = `${inputPath}.rvpgui_backup`;

  const removal = await removeContainerTitleFromFile(inputPath, tempOutputPath, { jobId });
  if (!removal.success) {
    await fs.rm(tempOutputPath, { force: true }).catch(() => {});
    return {
      inputPath,
      outputPath: null,
      success: false,
      canceled: Boolean(removal.canceled),
      error: removal.error
    };
  }

  if (isRemovalJobCanceled(jobId)) {
    await fs.rm(tempOutputPath, { force: true }).catch(() => {});
    return {
      inputPath,
      outputPath: null,
      success: false,
      canceled: true,
      error: 'Operation canceled by user.'
    };
  }

  const existingBackup = await safeStat(backupPath);
  if (existingBackup) {
    await fs.rm(backupPath, { force: true }).catch(() => {});
  }

  try {
    await fs.rename(inputPath, backupPath);
    await fs.rename(tempOutputPath, inputPath);
    await fs.rm(backupPath, { force: true });

    return {
      inputPath,
      outputPath: inputPath,
      success: true,
      canceled: false,
      error: null
    };
  } catch (error) {
    await fs.rm(tempOutputPath, { force: true }).catch(() => {});
    const currentInput = await safeStat(inputPath);
    const currentBackup = await safeStat(backupPath);

    if (!currentInput && currentBackup) {
      await fs.rename(backupPath, inputPath).catch(() => {});
    }

    return {
      inputPath,
      outputPath: null,
      success: false,
      canceled: false,
      error: `Failed to replace original file: ${error.message}`
    };
  }
}

async function mapWithConcurrency(items, worker, concurrency = 4) {
  const out = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (true) {
      const current = index;
      index += 1;

      if (current >= items.length) {
        break;
      }

      out[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return out;
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.map((p) => path.normalize(p))));
}

async function gatherVideoFiles(inputPaths) {
  const dedupedInputPaths = uniquePaths(inputPaths);
  const allFiles = [];

  for (const inputPath of dedupedInputPaths) {
    const stats = await safeStat(inputPath);
    if (!stats) {
      continue;
    }

    if (stats.isDirectory()) {
      await collectVideosRecursively(inputPath, allFiles);
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    const ext = path.extname(inputPath).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext)) {
      allFiles.push(path.normalize(inputPath));
    }
  }

  return uniquePaths(allFiles).sort((a, b) => a.localeCompare(b));
}

ipcMain.handle('app:pick-items', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose videos or folders',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [
      {
        name: 'Video Files',
        extensions: Array.from(VIDEO_EXTENSIONS).map((ext) => ext.replace('.', ''))
      }
    ]
  });

  if (result.canceled) {
    return { paths: [] };
  }

  return { paths: result.filePaths || [] };
});

ipcMain.handle('video:inspect', async (_event, payload) => {
  const inputPaths = Array.isArray(payload?.paths) ? payload.paths : [];
  const files = await gatherVideoFiles(inputPaths);
  const inspected = await mapWithConcurrency(files, (file) => runFfprobe(file), 4);

  return {
    count: inspected.length,
    files: inspected,
    scannedAt: new Date().toISOString()
  };
});

ipcMain.handle('video:remove-properties', async (_event, payload) => {
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const jobId = typeof payload?.jobId === 'string' ? payload.jobId : null;
  const dedupedFiles = uniquePaths(files);

  const results = await mapWithConcurrency(dedupedFiles, async (inputPath) => {
    if (isRemovalJobCanceled(jobId)) {
      return {
        inputPath,
        outputPath: null,
        success: false,
        canceled: true,
        error: 'Operation canceled by user.'
      };
    }

    const stats = await safeStat(inputPath);
    if (!stats || !stats.isFile()) {
      return {
        inputPath,
        outputPath: null,
        success: false,
        canceled: false,
        error: 'Input file was not found.'
      };
    }

    const inspection = await runFfprobe(inputPath);
    if (!inspection.formatTitle) {
      return {
        inputPath,
        outputPath: null,
        success: true,
        canceled: false,
        skipped: true,
        error: null
      };
    }

    const removal = await removeContainerTitleInPlace(inputPath, { jobId });
    return { ...removal, skipped: false };
  }, 2);

  const skipped = results.filter((item) => item.skipped).length;
  const failed = results.filter((item) => !item.success).length;
  const removed = results.filter((item) => item.success && !item.skipped).length;

  return {
    success: failed === 0,
    message: `Container title removal finished. Removed: ${removed}, Skipped (no title): ${skipped}, Failed: ${failed}.`,
    requestedFiles: dedupedFiles.length,
    results
  };
});

ipcMain.handle('video:cancel-removal', async (_event, payload) => {
  const jobId = typeof payload?.jobId === 'string' ? payload.jobId : null;
  if (!jobId) {
    return { ok: false, error: 'Missing removal job id.' };
  }

  const result = await cancelRemovalJob(jobId);
  return {
    ok: result.canceled,
    cleanedTempFiles: result.cleanedTempFiles
  };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle('app:open-external', async (_event, payload = {}) => {
  const rawUrl = typeof payload.url === 'string' ? payload.url : '';
  if (!ALLOWED_EXTERNAL_URLS.has(rawUrl)) {
    return { ok: false, error: 'Blocked external URL.' };
  }

  try {
    await shell.openExternal(rawUrl);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
