import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
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
  win.show();
  win.focus();
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  (async () => {
    try {
      // Fabric populates the canvas inside requestAnimationFrame, which a hidden or
      // occluded window may delay. Poll until the objects render (up to 30s).
      const deadline = Date.now() + 30000;
      let objectCount = -1;
      while (Date.now() < deadline) {
        objectCount = await win.webContents.executeJavaScript('window.__fabric ? window.__fabric.getObjects().length : -1');
        if (objectCount >= 2) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      log('OBJECTS AFTER WAIT', objectCount);
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
        const W = c.lowerCanvasEl.width, H = c.lowerCanvasEl.height;
        const scan = (x, y, w, h) => {
          const sx = Math.max(0, Math.round(x)), sy = Math.max(0, Math.round(y));
          const sw = Math.min(Math.round(w), W - sx), sh = Math.min(Math.round(h), H - sy);
          if (sw <= 0 || sh <= 0) return { dark: 0, opaque: 0 };
          const d = ctx.getImageData(sx, sy, sw, sh).data;
          let dark = 0, opaque = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 0) opaque++;
            if (d[i + 3] > 0 && d[i] < 128) dark++;
          }
          return { dark, opaque };
        };
        const zoom = c.getZoom();
        return { full: scan(0, 0, W, H), corner: scan(0, 0, 20, 20), zoom };
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
      const outImg = path.join(os.tmpdir(), 'opencode', 'ui.png');
      fs.mkdirSync(path.dirname(outImg), { recursive: true });
      fs.writeFileSync(outImg, img.toPNG());

      const ok = info.objects && info.objects.length === 2 &&
        info.objects.every((o) => o.text && o.text.length > 0 && o.visible) &&
        info.connected && info.notoSerif && !info.errors &&
        info.upperBg === 'rgba(0, 0, 0, 0)' &&
        scan.full.dark > 0 && scan.corner.opaque > 0 &&
        tpl.found && tpl.elements === 4 && tpl.bg && tpl.bg.endsWith('sample-background.png');
      log(ok ? 'UI SMOKE PASS' : 'UI SMOKE FAIL');
      app.exit(ok ? 0 : 1);
    } catch (e) {
      log('UI SMOKE FAIL', e.message);
      app.exit(1);
    }
  })();
});
