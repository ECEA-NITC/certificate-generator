import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(app.getPath('userData'), 'fonts');

const bundledCandidates = [
  path.join(__dirname, '..', '..', 'resources', 'fonts'),
  path.join(process.resourcesPath, 'resources', 'fonts'),
  path.join(process.resourcesPath, 'fonts'),
  path.join(process.cwd(), 'resources', 'fonts')
];
const BUNDLED_FONTS_DIR = bundledCandidates.find((d) => fs.existsSync(d)) || bundledCandidates[0];

const FONT_EXT = /\.(ttf|otf)$/i;

function ensureFontsDir() {
  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
  }
}

function parseFace(fileName) {
  const base = fileName.replace(FONT_EXT, '');
  const m = base.match(/^(.*?)-(BoldItalic|Bold|Italic)$/);
  if (m) {
    return {
      family: m[1],
      weight: m[2].includes('Bold') ? '700' : '400',
      style: m[2].includes('Italic') ? 'italic' : 'normal'
    };
  }
  return { family: base, weight: '400', style: 'normal' };
}

function groupFaces(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => FONT_EXT.test(f));
  const byFamily = new Map();
  for (const file of files) {
    const { family, weight, style } = parseFace(file);
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push({ path: path.join(dir, file), weight, style });
  }
  return [...byFamily.entries()].map(([name, faces]) => ({ name, faces }));
}

export function getFontsList() {
  ensureFontsDir();
  return {
    bundled: groupFaces(BUNDLED_FONTS_DIR),
    user: groupFaces(FONTS_DIR)
  };
}

export function installFont(filePath) {
  ensureFontsDir();
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.ttf' && ext !== '.otf') {
    throw new Error('Only .ttf and .otf fonts are supported');
  }
  const fileName = path.basename(filePath);
  const targetPath = path.join(FONTS_DIR, fileName);
  fs.copyFileSync(filePath, targetPath);
  const { family } = parseFace(fileName);
  return { success: true, path: targetPath, name: family };
}

export function getFontFacePaths(familyName) {
  const userFaces = groupFaces(FONTS_DIR).find((f) => f.name === familyName);
  if (userFaces) return userFaces.faces;
  const bundledFaces = groupFaces(BUNDLED_FONTS_DIR).find((f) => f.name === familyName);
  return bundledFaces ? bundledFaces.faces : [];
}