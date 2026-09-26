const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  dialog: {
    openImage: () => ipcRenderer.invoke('dialog:openImage'),
    openDataFile: () => ipcRenderer.invoke('dialog:openDataFile'),
    openFontFile: () => ipcRenderer.invoke('dialog:openFontFile'),
    selectOutputFolder: () => ipcRenderer.invoke('dialog:selectOutputFolder'),
    openTemplate: () => ipcRenderer.invoke('dialog:openTemplate')
  },
  fs: {
    readAsDataUrl: (filePath) => ipcRenderer.invoke('fs:readAsDataUrl', filePath)
  },
  data: {
    parseCSV: (filePath) => ipcRenderer.invoke('data:parseCSV', filePath),
    parseExcel: (filePath) => ipcRenderer.invoke('data:parseExcel', filePath)
  },
  export: {
    batch: async (params) => {
      const { onProgress, onCancel, ...rest } = params || {};
      const listener = (_, progress) => { if (onProgress) onProgress(progress); };
      ipcRenderer.on('export:progress', listener);
      try {
        return await ipcRenderer.invoke('export:batch', rest);
      } finally {
        ipcRenderer.removeListener('export:progress', listener);
      }
    },
    cancel: () => ipcRenderer.send('export:cancel')
  },
  template: {
    save: (template, filePath) => ipcRenderer.invoke('template:save', { template, filePath }),
    load: (filePath) => ipcRenderer.invoke('template:load', filePath),
    list: () => ipcRenderer.invoke('template:list')
  },
  font: {
    list: () => ipcRenderer.invoke('font:list'),
    install: (filePath) => ipcRenderer.invoke('font:install', filePath)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  }
});