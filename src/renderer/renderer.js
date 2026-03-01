const dropZone = document.getElementById('drop-zone');
const inspectButton = document.getElementById('inspect-button');
const clearButton = document.getElementById('clear-button');
const removeButton = document.getElementById('remove-button');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const resultCountEl = document.getElementById('result-count');

let queuedPaths = [];
let inspectedFiles = [];
let isBusy = false;

function dedupePaths(paths) {
  return [...new Set(paths)];
}

function asListItem(label, value) {
  if (!value) {
    return null;
  }

  const li = document.createElement('li');
  li.textContent = `${label}: ${value}`;
  return li;
}

function renderEmpty(message) {
  resultsEl.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = message;
  resultsEl.appendChild(p);
}

function renderResults(files) {
  resultsEl.innerHTML = '';

  if (!files.length) {
    renderEmpty('No video files were detected in the current selection.');
    return;
  }

  for (const file of files) {
    const card = document.createElement('article');
    card.className = 'file-card';

    const title = document.createElement('div');
    title.className = 'file-title';
    title.textContent = file.fileName || '(Unknown file)';

    const list = document.createElement('ul');
    list.className = 'meta-list';

    const containerTitle = asListItem('Container Title', file.formatTitle || '(none)');
    if (containerTitle) {
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

    resultsEl.appendChild(card);
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
  dropZone.classList.toggle('disabled', busy);
}

function updateSelection(paths) {
  queuedPaths = dedupePaths(paths);

  if (queuedPaths.length === 0) {
    setStatus('No files selected.');
    resultCountEl.textContent = '0 files';
    inspectedFiles = [];
    renderEmpty('Drop files or folders, then click Inspect Titles.');
    return;
  }

  setStatus(`Selected ${queuedPaths.length} item(s). Click Inspect Titles to scan recursively.`);
  resultCountEl.textContent = `${queuedPaths.length} queued item(s)`;
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

  setStatus('Inspecting container title metadata...');
  setUiBusy(true);

  try {
    const result = await window.appApi.inspectVideos(queuedPaths);
    inspectedFiles = result?.files || [];

    renderResults(inspectedFiles);
    resultCountEl.textContent = `${result?.count || 0} video file(s)`;

    if (inspectedFiles.length === 0) {
      setStatus('Scan completed: no supported videos were found.');
    } else {
      setStatus(`Scan completed: ${inspectedFiles.length} file(s) inspected.`);
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
    return;
  }

  setUiBusy(true);
  const skippedBeforeProcessing = inspectedFiles.filter((item) => item.filePath && !item.formatTitle).length;
  const filesToProcess = inspectedFiles
    .filter((item) => item.filePath && item.formatTitle)
    .map((item) => ({
      filePath: item.filePath,
      fileName: item.fileName || 'Unknown file'
    }));

  try {
    if (filesToProcess.length === 0) {
      setStatus('No container titles found to remove.');
      return;
    }

    const itemResults = [];
    setStatus(`Preparing removal 0/${filesToProcess.length}`, { processing: true });

    for (let i = 0; i < filesToProcess.length; i += 1) {
      const current = filesToProcess[i];
      setStatus(`Removing container title ${i + 1}/${filesToProcess.length}: ${current.fileName}`, { processing: true });

      const singleResult = await window.appApi.removeProperties([current.filePath]);
      const singleItems = Array.isArray(singleResult?.results) ? singleResult.results : [];
      itemResults.push(...singleItems);
    }

    const skippedDuringProcessing = itemResults.filter((item) => item.skipped).length;
    const skipped = skippedBeforeProcessing + skippedDuringProcessing;
    const failed = itemResults.filter((item) => !item.success).length;
    const removed = itemResults.filter((item) => item.success && !item.skipped).length;
    const summary = `Container title removal finished. Removed: ${removed}, Skipped: ${skipped}, Failed: ${failed}.`;
    console.table(itemResults.map((item) => ({
      input: item.inputPath,
      output: item.outputPath,
      success: item.success,
      skipped: Boolean(item.skipped),
      error: item.error || ''
    })));

    const refreshPaths = dedupePaths(itemResults.flatMap((item) => {
      if (item.success && item.skipped) {
        return item.inputPath ? [item.inputPath] : [];
      }

      if (item.success && item.outputPath) {
        return [item.outputPath];
      }

      return item.inputPath ? [item.inputPath] : [];
    }));

    if (refreshPaths.length > 0) {
      const refreshed = await window.appApi.inspectVideos(refreshPaths);
      inspectedFiles = refreshed?.files || [];
      renderResults(inspectedFiles);
      resultCountEl.textContent = `${refreshed?.count || 0} video file(s)`;
      setStatus(`${summary} List auto-refreshed.`);
    } else {
      setStatus(summary);
    }
  } catch (error) {
    setStatus(`Removal failed: ${error.message}`);
    console.error(error);
  } finally {
    setUiBusy(false);
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
  renderEmpty('Drop files or folders, then click Inspect Titles.');
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

dropZone.addEventListener('drop', (event) => {
  if (isBusy) {
    return;
  }

  event.preventDefault();
  dropZone.classList.remove('active');
  updateSelection(getDroppedPaths(event));
});

inspectButton.addEventListener('click', inspectQueuedPaths);
removeButton.addEventListener('click', removeProperties);
clearButton.addEventListener('click', clearAll);

renderEmpty('Drop files or folders, then click Inspect Titles.');
