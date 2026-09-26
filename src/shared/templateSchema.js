export const DEFAULT_CANVAS_SIZE = { width: 1754, height: 1240 };

export const DEFAULT_FONTS = [
  'Noto Serif',
  'Noto Sans',
  'Liberation Serif',
  'Liberation Sans'
];

export const ELEMENT_TYPES = {
  TEXT: 'text',
  IMAGE: 'image'
};

export function createDefaultTemplate(name = 'Untitled Certificate') {
  return {
    id: crypto.randomUUID(),
    name,
    backgroundImage: null,
    canvasSize: { ...DEFAULT_CANVAS_SIZE },
    elements: [
      {
        id: crypto.randomUUID(),
        type: ELEMENT_TYPES.TEXT,
        binding: 'student_name',
        x: DEFAULT_CANVAS_SIZE.width / 2,
        y: DEFAULT_CANVAS_SIZE.height * 0.35,
        fontFamily: 'Noto Serif',
        fontSize: 48,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#222222',
        align: 'center',
        maxWidth: DEFAULT_CANVAS_SIZE.width * 0.7,
        lineHeight: 1.2,
        defaultValue: 'Student Name'
      },
      {
        id: crypto.randomUUID(),
        type: ELEMENT_TYPES.TEXT,
        binding: 'roll_no',
        x: DEFAULT_CANVAS_SIZE.width / 2,
        y: DEFAULT_CANVAS_SIZE.height * 0.48,
        fontFamily: 'Noto Sans',
        fontSize: 24,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#444444',
        align: 'center',
        maxWidth: DEFAULT_CANVAS_SIZE.width * 0.5,
        lineHeight: 1.2,
        defaultValue: 'Roll No.'
      }
    ]
  };
}

export function validateTemplate(template) {
  if (!template.canvasSize || !template.canvasSize.width || !template.canvasSize.height) {
    throw new Error('Invalid canvas size');
  }
  if (!Array.isArray(template.elements)) {
    throw new Error('Elements must be an array');
  }
  return true;
}

export function applyBackgroundSize(template, newW, newH) {
  const oldW = template.canvasSize.width;
  const oldH = template.canvasSize.height;
  if (!newW || !newH || (newW === oldW && newH === oldH)) return template;
  const sx = newW / oldW;
  const sy = newH / oldH;
  template.canvasSize = { width: newW, height: newH };
  template.elements = template.elements.map((el) => ({
    ...el,
    x: Math.round(el.x * sx),
    y: Math.round(el.y * sy),
    fontSize: el.fontSize ? Math.max(8, Math.round(el.fontSize * sx)) : el.fontSize,
    maxWidth: el.maxWidth ? Math.round(el.maxWidth * sx) : el.maxWidth,
    width: el.width ? Math.round(el.width * sx) : el.width,
    height: el.height ? Math.round(el.height * sy) : el.height
  }));
  return template;
}

export function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

export function getElementById(template, id) {
  return template.elements.find(el => el.id === id);
}

export function updateElement(template, id, updates) {
  const idx = template.elements.findIndex(el => el.id === id);
  if (idx >= 0) {
    template.elements[idx] = { ...template.elements[idx], ...updates };
  }
  return template;
}

export function removeElement(template, id) {
  template.elements = template.elements.filter(el => el.id !== id);
  return template;
}

export function addElement(template, element) {
  template.elements.push({ ...element, id: crypto.randomUUID() });
  return template;
}