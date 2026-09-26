const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('renderAPI', {
  onInit: (cb) => ipcRenderer.on('render-init', (_, data) => cb(data)),
  onRow: (cb) => ipcRenderer.on('render-row', (_, data) => cb(data)),
  booted: () => ipcRenderer.send('render-booted'),
  ready: () => ipcRenderer.send('render-ready'),
  done: (payload) => ipcRenderer.send('render-done', payload),
  fail: (payload) => ipcRenderer.send('render-fail', payload),
  error: (message) => ipcRenderer.send('render-error', message)
});