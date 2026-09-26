import { BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { fileURLToPath } from 'url';
import { getFontFacePaths } from './fontHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cancelRequested = false;
export function requestExportCancel() { cancelRequested = true; }

const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif', svg: 'image/svg+xml'
};

function toDataUrl(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function sanitizeFilename(str) {
  return String(str).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'certificate';
}

function uniquePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}.${ext}`);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n}).${ext}`);
    n++;
  }
  return candidate;
}

function collectFonts(template) {
  const names = [...new Set(
    (template.elements || [])
      .filter((el) => el.type === 'text' && el.fontFamily)
      .map((el) => el.fontFamily)
  )];
  const faces = [];
  for (const name of names) {
    for (const face of getFontFacePaths(name)) {
      try {
        const buffer = fs.readFileSync(face.path);
        faces.push({ name, weight: face.weight, style: face.style, buffer: new Uint8Array(buffer).buffer });
      } catch { /* skip unreadable font */ }
    }
  }
  return faces;
}

function missingBindings(template, row) {
  const required = (template.elements || [])
    .filter((el) => el.type === 'text' && (el.binding === 'student_name' || el.binding === 'roll_no'))
    .map((el) => el.binding);
  return required.filter((b) => !row[b] || !String(row[b]).trim());
}

function resolveTemplateAssets(template) {
  const resolved = JSON.parse(JSON.stringify(template));
  if (resolved.backgroundImage && !resolved.backgroundImage.startsWith('data:')) {
    resolved.backgroundImage = toDataUrl(resolved.backgroundImage);
  }
  for (const el of resolved.elements || []) {
    if (el.type === 'image' && el.imageSrc && !el.imageSrc.startsWith('data:')) {
      el.imageSrc = toDataUrl(el.imageSrc);
    }
  }
  return resolved;
}

function createRenderWorker() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 400,
      height: 300,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, '..', 'render', 'render-preload.cjs')
      }
    });
    const timer = setTimeout(() => {
      cleanup();
      win.destroy();
      reject(new Error('Render worker failed to boot (timeout)'));
    }, 15000);
    const onError = (_, msg) => { cleanup(); win.destroy(); reject(new Error(msg)); };
    const onBooted = () => { cleanup(); resolve(win); };
    const cleanup = () => {
      clearTimeout(timer);
      ipcMain.removeListener('render-booted', onBooted);
      ipcMain.removeListener('render-error', onError);
    };
    ipcMain.on('render-booted', onBooted);
    ipcMain.on('render-error', onError);
    win.webContents.on('console-message', (_e, level, message) => {
      if (process.env.CERT_DEBUG) fs.writeSync(2, `[render ${level}] ${message}\n`);
      if (level >= 3) fs.writeSync(2, `[render error] ${message}\n`);
    });
    win.on('render-process-gone', () => { cleanup(); reject(new Error('Render process gone')); });
    win.loadFile(path.join(__dirname, '..', 'render', 'index.html'));
  });
}

function waitForInit(worker) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Render init timed out'));
    }, 15000);
    const onReady = () => { cleanup(); resolve(); };
    const onError = (_, msg) => { cleanup(); reject(new Error(msg)); };
    const cleanup = () => {
      clearTimeout(timer);
      ipcMain.removeListener('render-ready', onReady);
      ipcMain.removeListener('render-error', onError);
    };
    ipcMain.on('render-ready', onReady);
    ipcMain.on('render-error', onError);
  });
}

function renderRow(worker, index, row) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Render timeout on row ${index}`));
    }, 30000);
    const onDone = (_, payload) => {
      if (payload.index !== index) return;
      cleanup();
      resolve(payload.png);
    };
    const onFail = (_, payload) => {
      if (payload.index !== index) return;
      cleanup();
      reject(new Error(payload.error));
    };
    const cleanup = () => {
      clearTimeout(timer);
      ipcMain.removeListener('render-done', onDone);
      ipcMain.removeListener('render-fail', onFail);
    };
    ipcMain.on('render-done', onDone);
    ipcMain.on('render-fail', onFail);
    worker.webContents.send('render-row', { index, row });
  });
}

function sendProgress(sender, current, total) {
  if (sender && !sender.isDestroyed()) sender.send('export:progress', { current, total });
}

async function appendPdfPage(pdfDoc, pngBytes) {
  const page = pdfDoc.addPage();
  const image = await pdfDoc.embedPng(pngBytes);
  page.setSize(image.width, image.height);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
}

export async function exportBatch(params, sender) {
  const { template, data, outputFolder, format } = params;
  cancelRequested = false;

  if (!template) throw new Error('No template provided');
  if (!outputFolder) throw new Error('No output folder selected');
  if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

  const rows = data && Array.isArray(data.rows) && data.rows.length ? data.rows : [{}];
  const results = [];
  const errors = [];
  const worker = await createRenderWorker();
  let pdfDoc = null;
  if (format === 'merged-pdf') pdfDoc = await PDFDocument.create();

  try {
    const payload = { template: resolveTemplateAssets(template), fonts: collectFonts(template) };
    const initPromise = waitForInit(worker);
    worker.webContents.send('render-init', payload);
    await initPromise;

    let current = 0;
    for (let i = 0; i < rows.length; i++) {
      if (cancelRequested) {
        errors.push({ row: i + 1, error: 'Cancelled by user' });
        break;
      }

      const row = rows[i];
      const missing = missingBindings(template, row);
      if (missing.length) {
        errors.push({ row: i + 1, error: `Missing required field(s): ${missing.join(', ')}` });
        current++;
        sendProgress(sender, current, rows.length);
        continue;
      }

      try {
        const png = await renderRow(worker, i, row);
        const baseName = sanitizeFilename(`${row.roll_no || ''}_${row.student_name || row.name || i + 1}`)
          .replace(/^_|_$/g, '');

        if (format === 'png') {
          const out = uniquePath(outputFolder, baseName, 'png');
          fs.writeFileSync(out, Buffer.from(png));
          results.push({ row: i + 1, file: out });
        } else if (format === 'per-student-pdf') {
          const doc = await PDFDocument.create();
          await appendPdfPage(doc, png);
          const out = uniquePath(outputFolder, baseName, 'pdf');
          fs.writeFileSync(out, await doc.save());
          results.push({ row: i + 1, file: out });
        } else if (format === 'merged-pdf') {
          await appendPdfPage(pdfDoc, png);
          results.push({ row: i + 1 });
        } else {
          throw new Error(`Unknown export format: ${format}`);
        }
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }

      current++;
      sendProgress(sender, current, rows.length);
      await new Promise((r) => setImmediate(r));
    }

    if (format === 'merged-pdf' && pdfDoc) {
      const out = uniquePath(outputFolder, 'certificates_merged', 'pdf');
      fs.writeFileSync(out, await pdfDoc.save());
      results.push({ file: out, merged: true });
    }

    return { results, errors, cancelled: cancelRequested };
  } finally {
    if (!worker.isDestroyed()) worker.destroy();
  }
}