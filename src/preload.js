const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appApi', {
  pickItems: () => ipcRenderer.invoke('app:pick-items'),
  inspectVideos: (paths) => ipcRenderer.invoke('video:inspect', { paths }),
  removeProperties: (files, options = {}) => ipcRenderer.invoke('video:remove-properties', { files, ...options }),
  cancelRemoval: (jobId) => ipcRenderer.invoke('video:cancel-removal', { jobId }),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', { url })
});
