const dropZone = document.getElementById('drop-zone');
const inspectButton = document.getElementById('inspect-button');
const clearButton = document.getElementById('clear-button');
const removeButton = document.getElementById('remove-button');
const stopButton = document.getElementById('stop-button');
const includeNoTitleCheckbox = document.getElementById('include-no-title-checkbox');
const supportButton = document.getElementById('support-button');
const coffeeButton = document.getElementById('coffee-button');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const resultCountEl = document.getElementById('result-count');

const SUPPORT_URL = 'https://github.com/pbeens/Video-Container-Title-Cleaner/issues';
const COFFEE_URL = 'https://www.buymeacoffee.com/pbeens';

let queuedPaths = [];
let inspectedFiles = [];
let isBusy = false;
let isRemoving = false;
let stopRequested = false;
let activeRemovalJobId = null;
const fileCardMap = new Map();

function dedupePaths(paths) {
  return [...new Set(paths)];
}

function summarizeContainerTitles(files) {
  const withTitle = files.filter((item) => typeof item.formatTitle === 'string' && item.formatTitle.trim().length > 0).length;
  const withoutTitle = files.length - withTitle;
  return { withTitle, withoutTitle };
}

function setRemoveButtonPulse(enabled) {
  removeButton.classList.toggle('pulse-next', Boolean(enabled));
}

function syncDropZoneIdlePulse() {
  const shouldPulse = !isBusy && queuedPaths.length === 0;
  dropZone.classList.toggle('idle-pulse', shouldPulse);
}

function hasContainerTitle(item) {
  return typeof item?.formatTitle === 'string' && item.formatTitle.trim().length > 0;
}

function asListItem(label, value) {
  if (!value) {
    return null;
  }

  const li = document.createElement('li');
  li.textContent = `${label}: ${value}`;
  return li;
}

function makeOperationStatusLine(file) {
  if (!file?.operationStatus) {
    return null;
  }

  const p = document.createElement('p');
  p.className = `op-status ${file.operationKind || 'info'}`;
  p.textContent = `Status: ${file.operationStatus}`;
  return p;
}

function setFileOperationStatus(filePath, status, kind = 'info') {
  const item = inspectedFiles.find((entry) => entry.filePath === filePath);
  if (item) {
    item.operationStatus = status;
    item.operationKind = kind;
  }

  const card = fileCardMap.get(filePath);
  if (!card) {
    return;
  }

  let statusLine = card.querySelector('.op-status');
  if (!statusLine) {
    statusLine = document.createElement('p');
    card.appendChild(statusLine);
  }

  statusLine.className = `op-status ${kind}`;
  statusLine.textContent = `Status: ${status}`;
}

function setFileContainerTitle(filePath, title) {
  const item = inspectedFiles.find((entry) => entry.filePath === filePath);
  if (item) {
    item.formatTitle = title;
  }

  const card = fileCardMap.get(filePath);
  if (!card) {
    return;
  }

  const titleLine = card.querySelector('.container-title');
  if (titleLine) {
    titleLine.textContent = `Container Title: ${title || '(none)'}`;
  }
}

function focusFileCard(filePath) {
  const card = fileCardMap.get(filePath);
  if (!card) {
    return;
  }

  card.classList.add('processing-focus');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    card.classList.remove('processing-focus');
  }, 800);
}

function renderEmpty(message) {
  resultsEl.innerHTML = '';
  fileCardMap.clear();
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = message;
  resultsEl.appendChild(p);
}

function renderResults(files) {
  resultsEl.innerHTML = '';
  fileCardMap.clear();

  for (const file of files) {
    const card = document.createElement('article');
    card.className = 'file-card';
    if (file.filePath) {
      fileCardMap.set(file.filePath, card);
    }

    const title = document.createElement('div');
    title.className = 'file-title';
    title.textContent = file.fileName || '(Unknown file)';

    const list = document.createElement('ul');
    list.className = 'meta-list';

    const containerTitle = asListItem('Container Title', file.formatTitle || '(none)');
    if (containerTitle) {
      containerTitle.classList.add('container-title');
      list.appendChild(containerTitle);
    }

    if (file.error) {
      const error = document.createElement('p');
      error.className = 'error';
      error.textContent = `ffprobe message: ${file.error}`;
      card.appendChild(error);
    }

    card.appendChild(title);
    card.appendChild(list);
    const opStatus = makeOperationStatusLine(file);
    if (opStatus) {
      card.appendChild(opStatus);
    }

    resultsEl.appendChild(card);
  }
}

function getVisibleInspectedFiles() {
  if (!includeNoTitleCheckbox?.checked) {
    return inspectedFiles;
  }

  return inspectedFiles.filter((item) => hasContainerTitle(item));
}

function renderCurrentResults() {
  if (!inspectedFiles.length) {
    resultCountEl.textContent = '0 video file(s)';
    renderEmpty('No video files were detected in the current selection.');
    return;
  }

  const visibleFiles = getVisibleInspectedFiles();
  if (!visibleFiles.length) {
    resultCountEl.textContent = `0 shown (${inspectedFiles.length} scanned)`;
    renderEmpty('No files match the current filter.');
    return;
  }

  renderResults(visibleFiles);
  if (includeNoTitleCheckbox?.checked) {
    resultCountEl.textContent = `${visibleFiles.length} shown (${inspectedFiles.length} scanned)`;
  } else {
    resultCountEl.textContent = `${visibleFiles.length} video file(s)`;
  }
}

function setStatus(text, options = {}) {
  const processing = Boolean(options.processing);
  statusEl.textContent = text;
  statusEl.classList.toggle('processing', processing);
}

function setUiBusy(busy) {
  isBusy = busy;
  inspectButton.disabled = busy;
  clearButton.disabled = busy;
  removeButton.disabled = busy;
  if (busy) {
    setRemoveButtonPulse(false);
  }
  if (includeNoTitleCheckbox) {
    includeNoTitleCheckbox.disabled = busy;
  }
  if (stopButton) {
    stopButton.hidden = !(busy && isRemoving);
    stopButton.disabled = !busy || !isRemoving || stopRequested;
  }
  dropZone.classList.toggle('disabled', busy);
  syncDropZoneIdlePulse();
}

function updateSelection(paths, options = {}) {
  const autoInspect = Boolean(options.autoInspect);
  queuedPaths = dedupePaths(paths);

  if (queuedPaths.length === 0) {
    setStatus('No files selected.');
    resultCountEl.textContent = '0 files';
    inspectedFiles = [];
    renderEmpty('Drop files or folders, then click Inspect Titles.');
    syncDropZoneIdlePulse();
    return;
  }

  if (autoInspect) {
    setStatus(`Selected ${queuedPaths.length} item(s). Scanning recursively...`);
  } else {
    setStatus(`Selected ${queuedPaths.length} item(s). Click Inspect Titles to scan recursively.`);
  }
  resultCountEl.textContent = `${queuedPaths.length} queued item(s)`;
  syncDropZoneIdlePulse();
}

async function pickItems() {
  if (isBusy) {
    return;
  }

  const result = await window.appApi.pickItems();
  updateSelection(result?.paths || []);
}

function getDroppedPaths(event) {
  const files = Array.from(event.dataTransfer?.files || []);
  return files.map((file) => file.path).filter(Boolean);
}

async function inspectQueuedPaths() {
  if (isBusy) {
    return;
  }

  if (queuedPaths.length === 0) {
    setStatus('Nothing to inspect yet. Drop files/folders first.');
    return;
  }

  setStatus('Inspecting container title metadata...', { processing: true });
  setRemoveButtonPulse(false);
  setUiBusy(true);

  try {
    const result = await window.appApi.inspectVideos(queuedPaths);
    inspectedFiles = result?.files || [];
    renderCurrentResults();

    if (inspectedFiles.length === 0) {
      setStatus('Scan completed: no supported videos were found.');
      setRemoveButtonPulse(false);
    } else {
      const summary = summarizeContainerTitles(inspectedFiles);
      setStatus(
        `Scan completed: ${inspectedFiles.length} file(s) inspected. Titles: ${summary.withTitle}, None: ${summary.withoutTitle}.`
      );
      setRemoveButtonPulse(summary.withTitle > 0);
    }
  } catch (error) {
    setStatus(`Inspection failed: ${error.message}`);
    renderEmpty('Failed to inspect files. Check console for details.');
    console.error(error);
  } finally {
    setUiBusy(false);
  }
}

async function removeProperties() {
  if (isBusy) {
    return;
  }

  if (!inspectedFiles.length) {
    setStatus('Inspect files first. Removal requires a scanned list.');
    setRemoveButtonPulse(false);
    return;
  }

  isRemoving = true;
  stopRequested = false;
  activeRemovalJobId = `removal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  setRemoveButtonPulse(false);
  setUiBusy(true);
  const skippedBeforeProcessing = inspectedFiles.filter((item) => item.filePath && !hasContainerTitle(item)).length;
  const filesToProcess = inspectedFiles
    .filter((item) => item.filePath && hasContainerTitle(item))
    .map((item) => ({
      filePath: item.filePath,
      fileName: item.fileName || 'Unknown file'
    }));

  try {
    if (filesToProcess.length === 0) {
      setStatus('No eligible files found for the selected removal option.');
      setRemoveButtonPulse(false);
      return;
    }

    const itemResults = [];
    setStatus(`Preparing removal 0/${filesToProcess.length}`, { processing: true });
    let cancelledCount = 0;

    for (let i = 0; i < filesToProcess.length; i += 1) {
      if (stopRequested) {
        break;
      }

      const current = filesToProcess[i];
      setFileOperationStatus(current.filePath, 'Processing...', 'processing');
      focusFileCard(current.filePath);
      setStatus(`Removing container title ${i + 1}/${filesToProcess.length}: ${current.fileName}`, { processing: true });

      const singleResult = await window.appApi.removeProperties([current.filePath], { jobId: activeRemovalJobId });
      const singleItems = Array.isArray(singleResult?.results) ? singleResult.results : [];
      itemResults.push(...singleItems);

      const latest = singleItems[0];
      if (latest) {
        if (latest.canceled) {
          cancelledCount += 1;
          setFileOperationStatus(current.filePath, 'Canceled by user.', 'skipped');
          break;
        }

        if (latest.success && latest.skipped) {
          setFileOperationStatus(current.filePath, 'Skipped (no title found).', 'skipped');
          setFileContainerTitle(current.filePath, null);
        } else if (latest.success) {
          setFileOperationStatus(current.filePath, 'Removed.', 'success');
          setFileContainerTitle(current.filePath, null);
        } else {
          setFileOperationStatus(current.filePath, `Failed: ${latest.error || 'Unknown error'}`, 'error');
        }
      }
    }

    const skippedDuringProcessing = itemResults.filter((item) => item.skipped).length;
    const skipped = skippedBeforeProcessing + skippedDuringProcessing;
    const failed = itemResults.filter((item) => !item.success).length;
    const removed = itemResults.filter((item) => item.success && !item.skipped).length;
    const summary = `Container title removal finished. Removed: ${removed}, Skipped: ${skipped}, Failed: ${failed}, Canceled: ${cancelledCount}.`;
    console.table(itemResults.map((item) => ({
      input: item.inputPath,
      output: item.outputPath,
      success: item.success,
      skipped: Boolean(item.skipped),
      error: item.error || ''
    })));

    setStatus(summary);
    renderCurrentResults();
  } catch (error) {
    setStatus(`Removal failed: ${error.message}`);
    console.error(error);
  } finally {
    isRemoving = false;
    stopRequested = false;
    activeRemovalJobId = null;
    setUiBusy(false);
  }
}

async function stopProcessing() {
  if (!isRemoving || !activeRemovalJobId || stopRequested) {
    return;
  }

  stopRequested = true;
  setUiBusy(true);
  setStatus('Stopping processing and cleaning up temporary files...', { processing: true });

  try {
    await window.appApi.cancelRemoval(activeRemovalJobId);
  } catch (error) {
    setStatus(`Stop request failed: ${error.message}`);
  }
}

function clearAll() {
  if (isBusy) {
    return;
  }

  queuedPaths = [];
  inspectedFiles = [];
  resultCountEl.textContent = '0 files';
  setStatus('Cleared current selection and results.');
  setRemoveButtonPulse(false);
  renderEmpty('Drop files or folders, then click Inspect Titles.');
}

async function openSupportLink(url) {
  try {
    const result = await window.appApi.openExternal(url);
    if (!result?.ok) {
      setStatus(`Could not open link: ${result?.error || 'Unknown error'}`);
    }
  } catch (error) {
    setStatus(`Could not open link: ${error.message}`);
  }
}

dropZone.addEventListener('click', pickItems);
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    pickItems();
  }
});

dropZone.addEventListener('dragover', (event) => {
  if (isBusy) {
    return;
  }

  event.preventDefault();
  dropZone.classList.add('active');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('active');
});

dropZone.addEventListener('drop', async (event) => {
  if (isBusy) {
    return;
  }

  event.preventDefault();
  dropZone.classList.remove('active');
  const droppedPaths = getDroppedPaths(event);
  updateSelection(droppedPaths, { autoInspect: true });

  if (droppedPaths.length > 0) {
    await inspectQueuedPaths();
  }
});

inspectButton.addEventListener('click', inspectQueuedPaths);
removeButton.addEventListener('click', removeProperties);
stopButton?.addEventListener('click', stopProcessing);
clearButton.addEventListener('click', clearAll);
includeNoTitleCheckbox?.addEventListener('change', () => {
  if (isBusy || inspectedFiles.length === 0) {
    return;
  }

  renderCurrentResults();
});
supportButton?.addEventListener('click', () => openSupportLink(SUPPORT_URL));
coffeeButton?.addEventListener('click', () => openSupportLink(COFFEE_URL));

renderEmpty('Drop files or folders, then click Inspect Titles.');
syncDropZoneIdlePulse();
