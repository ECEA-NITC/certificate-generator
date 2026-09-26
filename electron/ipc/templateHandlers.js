import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(app.getPath('userData'), 'templates');

function ensureTemplatesDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
}

function seedSamplesIfNeeded() {
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'resources', 'sample-templates'),
      path.join(process.resourcesPath, 'resources', 'sample-templates'),
      path.join(process.cwd(), 'resources', 'sample-templates')
    ];
    const sampleDir = candidates.find((dir) => fs.existsSync(path.join(dir, 'sample-achievement.json')));
    if (!sampleDir) return;
    ensureTemplatesDir();
    const targetJson = path.join(TEMPLATES_DIR, 'sample-achievement.json');
    if (fs.existsSync(targetJson)) return;
    const bgSrc = path.join(sampleDir, 'background.png');
    const bgTarget = path.join(TEMPLATES_DIR, 'sample-background.png');
    if (fs.existsSync(bgSrc)) fs.copyFileSync(bgSrc, bgTarget);
    const template = JSON.parse(fs.readFileSync(path.join(sampleDir, 'sample-achievement.json'), 'utf-8'));
    template.backgroundImage = fs.existsSync(bgTarget) ? bgTarget : null;
    fs.writeFileSync(targetJson, JSON.stringify(template, null, 2), 'utf-8');
  } catch {
    /* seeding is best-effort */
  }
}

export function saveTemplate(template, filePath) {
  ensureTemplatesDir();
  const targetPath = filePath || path.join(TEMPLATES_DIR, `${template.id || Date.now()}.json`);
  const data = JSON.stringify(template, null, 2);
  fs.writeFileSync(targetPath, data, 'utf-8');
  return { success: true, path: targetPath };
}

export function loadTemplate(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

export function listTemplates() {
  seedSamplesIfNeeded();
  ensureTemplatesDir();
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const filePath = path.join(TEMPLATES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
      const template = JSON.parse(content);
      return { id: template.id, name: template.name, filePath };
    } catch {
      return null;
    }
  }).filter(Boolean);
}