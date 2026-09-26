# Certificate Generator

Local-only Electron desktop app for generating certificates in bulk. Design a certificate once, import a spreadsheet of recipients, and export PNG images, individual PDFs, or one merged PDF.

No network access is required at any point — fonts, fonts rendering, parsing and PDF generation all happen on your machine.

## Features

- **Simple mode** – minimal editor: background image, CSV/Excel import, ready-made name/roll fields, export.
- **Advanced mode** – full Fabric.js canvas editor: add/edit text elements, bind any element to a CSV column, adjust fonts, colors, alignment, canvas size; preview with any data row.
- **Export formats** (choose at export time):
  - PNG images (one per recipient)
  - Individual PDF files (A4 landscape)
  - Single merged PDF (one file, one page per recipient)
- **Progress reporting** with cancel, and clear error rows (e.g. missing required fields).
- **Bundled fonts** (Noto Serif, Noto Sans, Liberation Serif, Liberation Sans) plus user font install (.ttf/.otf).
- **Templates**: save/load in Advanced mode; a sample template is seeded on first run.

## Requirements

- Node.js 18+ and npm

## Quick start

```bash
npm install
npm run build:vite   # build the renderer
npm run dev          # run the app with the vite dev server
```

### Development

```bash
npm run dev          # vite dev server + electron with live reload-less reload
```

### Production build (Linux unpacked)

```bash
npm run build:vite
npx electron-builder --linux dir     # → release/linux-unpacked/certificate_generator
npx electron-builder --linux         # → release/*.AppImage + release/*.deb (requires network)
```

Windows/macOS targets are configured in `package.json` (`nsis`, `portable`, `dmg`, `zip`).

## Usage

1. **(Advanced) Load or design a template** – upload a background image (PNG/JPG/WebP), add text elements, and set each element's *Binding* to the CSV column that should fill it (`student_name` is required in the data).
2. **Import data** – CSV or Excel (.xlsx/.xls). The first row must be the header row.
3. **Preview** – step through rows; the canvas shows exactly what will be exported.
4. **Export** – pick PNG / per-student PDF / merged PDF, choose an output folder, and start. Progress and per-row errors are shown; you can cancel at any time.

## Sample data

`resources/sample-templates/` contains a ready-made sample:

- `sample-achievement.json` – template (seeded into the app's template list on first launch)
- `background.png` – certificate background
- `students.csv` – example recipients

## Project layout

```
electron/            main process (ESM)
  main.js            window + app lifecycle
  preload.cjs        contextBridge API (contextIsolation on, sandbox on)
  ipc/               IPC handlers: data, fonts, templates, export
  render/            hidden BrowserWindow that renders certificates to canvas
src/                 renderer (React 18 + Vite)
  modes/             SimpleMode / AdvancedMode editors
  shared/            template schema
resources/           bundled fonts + sample templates
```

## Tests

```bash
npm run build:vite
timeout 120 npx electron electron/e2e.js --no-sandbox --disable-gpu     # export pipeline
timeout 60  npx electron electron/smoke.js --no-sandbox --disable-gpu    # UI smoke + screenshot
```

`e2e.js` writes PNGs/PDFs to `/tmp/opencode/cert-e2e/out/` and asserts `E2E PASS`;
`smoke.js` asserts the editor renders text, fonts are loaded and the sample template seeds.

## Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- No `file://` or remote navigation; window opening is denied/redirected to the OS browser
- Images cross process boundaries as data URLs; nothing is fetched from the network

## License

Licensed under [GPL-3.0](LICENSE).

**Credit:** Certificate Generator was developed by **ECEA-NITC** — https://github.com/ECEA-NITC/certificate-generator. If you use or redistribute this software, please retain this attribution.
