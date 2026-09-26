/* Hidden-window certificate renderer. Runs with contextIsolation + renderAPI preload. */
(function () {
  console.log('render.js evaluated, renderAPI:', typeof window.renderAPI);
  let canvas, ctx, template, images = {};

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function init(payload) {
    console.log('render init start, fonts:', (payload.fonts || []).length);
    template = payload.template;
    canvas = document.getElementById('c');
    canvas.width = template.canvasSize.width;
    canvas.height = template.canvasSize.height;
    ctx = canvas.getContext('2d');

    for (const f of payload.fonts || []) {
      try {
        const face = new FontFace(f.name, f.buffer, { weight: f.weight || '400', style: f.style || 'normal' });
        await face.load();
        document.fonts.add(face);
      } catch (e) {
        console.error('font load failed', f.name, e);
      }
    }
    await document.fonts.ready;

    const urls = new Set();
    if (template.backgroundImage) urls.add(template.backgroundImage);
    (template.elements || []).forEach((el) => { if (el.imageSrc) urls.add(el.imageSrc); });
    await Promise.all([...urls].map(async (u) => { images[u] = await loadImage(u); }));
    console.log('render init done, images:', Object.keys(images).length);

    window.renderAPI.ready();
  }

  function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  function drawText(el, value) {
    ctx.font = `${el.fontStyle || 'normal'} ${el.fontWeight || 'normal'} ${el.fontSize}px "${el.fontFamily}"`;
    ctx.fillStyle = el.color || '#000000';
    ctx.textAlign = el.align || 'left';
    ctx.textBaseline = 'top';

    const maxWidth = el.maxWidth || (template.canvasSize.width - el.x - 20);
    const lines = wrapText(value, maxWidth);
    const lineHeight = el.fontSize * (el.lineHeight || 1.2);
    for (let i = 0; i < lines.length; i++) {
      // el.x is the anchor matching fabric originX (left/center/right)
      ctx.fillText(lines[i], el.x, el.y + i * lineHeight);
    }
  }

  function drawImageEl(el) {
    const img = images[el.imageSrc];
    if (!img) return;
    const w = (el.width || img.naturalWidth) * (el.scaleX || 1);
    const h = (el.height || img.naturalHeight) * (el.scaleY || 1);
    if (el.angle) {
      ctx.save();
      ctx.translate(el.x, el.y);
      ctx.rotate(el.angle * Math.PI / 180);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, el.x, el.y, w, h);
    }
  }

  function renderRow(row) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = images[template.backgroundImage];
    if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    for (const el of template.elements || []) {
      if (el.type === 'image') { drawImageEl(el); continue; }
      const value = el.binding && row[el.binding] !== undefined && row[el.binding] !== ''
        ? String(row[el.binding])
        : (el.defaultValue || '');
      if (value) drawText(el, value);
    }
  }

  async function onRow({ index, row }) {
    try {
      renderRow(row);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const buf = new Uint8Array(await blob.arrayBuffer());
      window.renderAPI.done({ index, png: buf });
    } catch (e) {
      window.renderAPI.fail({ index, error: String(e && e.message || e) });
    }
  }

  window.renderAPI.onInit(async (payload) => {
    try {
      await init(payload);
    } catch (e) {
      window.renderAPI.error('Render init failed: ' + (e && e.message || e));
    }
  });
  window.renderAPI.onRow(onRow);
  window.renderAPI.booted();
})();