import { ipcMain, dialog, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseCSV, parseExcel } from './dataHandlers.js';
import { exportBatch, requestExportCancel } from './exportHandlers.js';
import { saveTemplate, loadTemplate, listTemplates } from './templateHandlers.js';
import { getFontsList, installFont } from './fontHandlers.js';

const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif', svg: 'image/svg+xml'
};

export function registerIpcHandlers() {
  ipcMain.handle('fs:readAsDataUrl', (_, filePath) => {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const buf = fs.readFileSync(filePath);
    return `data:${mime};base64,${buf.toString('base64')}`;
  });

  ipcMain.handle('dialog:openImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openDataFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'CSV', extensions: ['csv'] },
        { name: 'Excel', extensions: ['xlsx', 'xls'] },
        { name: 'All Files', extensions: ['csv', 'xlsx', 'xls'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openFontFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:selectOutputFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openTemplate', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Template', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('data:parseCSV', (_, filePath) => parseCSV(filePath));
  ipcMain.handle('data:parseExcel', (_, filePath) => parseExcel(filePath));

  ipcMain.handle('export:batch', (event, params) => exportBatch(params, event.sender));
  ipcMain.on('export:cancel', () => requestExportCancel());

  ipcMain.handle('template:save', (_, { template, filePath }) => saveTemplate(template, filePath));
  ipcMain.handle('template:load', (_, filePath) => loadTemplate(filePath));
  ipcMain.handle('template:list', () => listTemplates());

  ipcMain.handle('font:list', () => getFontsList());
  ipcMain.handle('font:install', (_, filePath) => installFont(filePath));

  ipcMain.handle('shell:openExternal', (_, url) => {
    if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) {
      return shell.openExternal(url);
    }
  });
}