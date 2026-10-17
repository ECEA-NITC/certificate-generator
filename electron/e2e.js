import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exportBatch } from './ipc/exportHandlers.js';
import { parseCSV } from './ipc/dataHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F = path.join(os.tmpdir(), 'opencode', 'cert-e2e');
const OUT = path.join(F, 'out');
const SAMPLES = path.join(__dirname, '..', 'resources', 'sample-templates');

function log(...args) { fs.writeSync(1, args.join(' ') + '\n'); }

app.whenReady().then(async () => {
  // keep a window alive so Electron's default quit-on-all-windows-closed doesn't fire
  const keeper = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  void keeper;
  try {
    fs.rmSync(F, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    // Stage self-contained fixtures so the test runs on any platform / clean clone.
    fs.copyFileSync(path.join(SAMPLES, 'background.png'), path.join(F, 'bg.png'));
    // Normalize to LF so the appended row isn't broken by mixed line endings.
    const sampleCsv = fs.readFileSync(path.join(SAMPLES, 'students.csv'), 'utf-8')
      .replace(/\r\n/g, '\n')
      .trimEnd();
    // Append one deliberately incomplete row to exercise the missing-required-field path.
    fs.writeFileSync(path.join(F, 'students.csv'), `${sampleCsv}\n,21CS999,Computer Science,25 Sep 2026\n`, 'utf-8');

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

    const EXPECTED_ROWS = 6; // 6 valid rows in the sample CSV
    const ok = pngResult.results.length === EXPECTED_ROWS &&
      pngResult.errors.length === 1 &&
      mergedResult.results.length - 1 === EXPECTED_ROWS && // minus the merged-file entry
      pdfResult.results.length === EXPECTED_ROWS &&
      files.filter((f) => f.endsWith('.png')).length === EXPECTED_ROWS &&
      files.some((f) => f.includes('merged') && f.endsWith('.pdf'));
    log(ok ? 'E2E PASS' : 'E2E FAIL');
    app.exit(ok ? 0 : 1);
  } catch (e) {
    log('E2E EXCEPTION:', e.stack || String(e));
    app.exit(1);
  }
});