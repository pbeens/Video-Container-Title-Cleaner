const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appApi', {
  pickItems: () => ipcRenderer.invoke('app:pick-items'),
  inspectVideos: (paths) => ipcRenderer.invoke('video:inspect', { paths }),
  removeProperties: (files) => ipcRenderer.invoke('video:remove-properties', { files })
});
