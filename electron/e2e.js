import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { exportBatch } from './ipc/exportHandlers.js';
import { parseCSV } from './ipc/dataHandlers.js';

const OUT = '/tmp/opencode/cert-e2e/out';
const F = '/tmp/opencode/cert-e2e';

function log(...args) { fs.writeSync(1, args.join(' ') + '\n'); }

app.whenReady().then(async () => {
  // keep a window alive so Electron's default quit-on-all-windows-closed doesn't fire
  const keeper = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  void keeper;
  try {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    const csv = await parseCSV(path.join(F, 'students.csv'));
    log('parsed rows:', csv.rows.length, 'headers:', csv.headers.join(','));

    const template = {
      id: 'e2e',
      name: 'E2E Cert',
      backgroundImage: path.join(F, 'bg.png'),
      canvasSize: { width: 800, height: 600 },
      elements: [
        {
          id: 'el1', type: 'text', binding: 'student_name',
          x: 400, y: 200, fontFamily: 'Noto Serif', fontSize: 48,
          fontWeight: 'normal', fontStyle: 'normal', color: '#111111',
          align: 'center', maxWidth: 700, lineHeight: 1.2, defaultValue: 'Name'
        },
        {
          id: 'el2', type: 'text', binding: 'roll_no',
          x: 400, y: 300, fontFamily: 'sans-serif', fontSize: 24,
          fontWeight: 'normal', fontStyle: 'normal', color: '#444444',
          align: 'center', maxWidth: 700, lineHeight: 1.2, defaultValue: 'Roll'
        }
      ]
    };

    log('--- test 1: PNG batch ---');
    const pngResult = await exportBatch({ template, data: csv, outputFolder: OUT, format: 'png' }, null);
    log('results:', pngResult.results.length, 'errors:', pngResult.errors.length);
    log('errors detail:', JSON.stringify(pngResult.errors));

    log('--- test 2: merged PDF ---');
    const mergedResult = await exportBatch({ template, data: csv, outputFolder: OUT, format: 'merged-pdf' }, null);
    log('results:', mergedResult.results.length, 'errors:', mergedResult.errors.length);

    log('--- test 3: per-student PDF ---');
    const pdfResult = await exportBatch({ template, data: csv, outputFolder: OUT, format: 'per-student-pdf' }, null);
    log('results:', pdfResult.results.length, 'errors:', pdfResult.errors.length);

    const files = fs.readdirSync(OUT).sort();
    log('files written:', files.join(', '));
    const pngBytes = files.filter((f) => f.endsWith('.png')).map((f) => fs.statSync(path.join(OUT, f)).size);
    log('png sizes:', pngBytes.join(', '));

    const ok = pngResult.results.length === 4 &&
      pngResult.errors.length === 1 &&
      files.some((f) => f.endsWith('.png') && f.length > 5) &&
      files.some((f) => f.includes('merged') && f.endsWith('.pdf'));
    log(ok ? 'E2E PASS' : 'E2E FAIL');
    app.exit(ok ? 0 : 1);
  } catch (e) {
    log('E2E EXCEPTION:', e.stack || String(e));
    app.exit(1);
  }
});