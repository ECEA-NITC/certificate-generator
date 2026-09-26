import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc/handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function log(...args) { fs.writeSync(1, args.join(' ') + '\n'); }

registerIpcHandlers();

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (process.env.CERT_DEBUG || level >= 3) log(`[ui ${level}] ${message}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => log(`FAIL LOAD ${code} ${desc}`));
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  setTimeout(async () => {
    try {
      const info = await win.webContents.executeJavaScript(`(() => {
        const c = window.__fabric;
        return {
          objects: c ? c.getObjects().map(o => ({ type: o.type, text: o.text, left: Math.round(o.left), top: Math.round(o.top), visible: o.visible })) : null,
          zoom: c ? c.getZoom() : null,
          dims: c ? c.getWidth() + 'x' + c.getHeight() : null,
          connected: c ? c.lowerCanvasEl.isConnected : null,
          upperBg: c && c.upperCanvasEl ? getComputedStyle(c.upperCanvasEl).backgroundColor : null,
          fonts: document.fonts.status,
          notoSerif: document.fonts.check('48px "Noto Serif"'),
          errors: window.__fontErrors || null
        };
      })()`);
      log('FABRIC INFO', JSON.stringify(info));

      const scan = await win.webContents.executeJavaScript(`(() => {
        const c = window.__fabric;
        const ctx = c.lowerCanvasEl.getContext('2d');
        const scan = (x, y, w, h) => {
          const d = ctx.getImageData(x, y, w, h).data;
          let dark = 0, opaque = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 0) opaque++;
            if (d[i + 3] > 0 && d[i] < 128) dark++;
          }
          return { dark, opaque };
        };
        return {
          name: scan(50, 88, 280, 24),
          roll: scan(50, 118, 280, 20),
          corner: scan(0, 0, 20, 20)
        };
      })()`);
      log('SCAN', JSON.stringify(scan));

      const tpl = await win.webContents.executeJavaScript(`(async () => {
        const list = await window.api.template.list();
        const sample = list.find(t => t.id === 'sample-achievement');
        if (!sample) return { found: false, list: list.map(t => t.id) };
        const loaded = await window.api.template.load(sample.filePath);
        return { found: true, elements: loaded.elements.length, bg: loaded.backgroundImage, name: loaded.name };
      })()`);
      log('SAMPLE TEMPLATE', JSON.stringify(tpl));

      const img = await win.webContents.capturePage();
      fs.writeFileSync('/tmp/opencode/ui.png', img.toPNG());

      const ok = info.objects && info.objects.length === 2 &&
        info.connected && info.notoSerif && !info.errors &&
        info.upperBg === 'rgba(0, 0, 0, 0)' &&
        scan.name.dark > 0 && scan.roll.dark > 0 && scan.corner.opaque > 0 &&
        tpl.found && tpl.elements === 4 && tpl.bg && tpl.bg.endsWith('sample-background.png');
      log(ok ? 'UI SMOKE PASS' : 'UI SMOKE FAIL');
      app.exit(ok ? 0 : 1);
    } catch (e) {
      log('UI SMOKE FAIL', e.message);
      app.exit(1);
    }
  }, 4000);
});
