import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fabric } from 'fabric';
import { createDefaultTemplate, cloneTemplate, updateElement, getElementById, applyBackgroundSize } from '../shared/templateSchema';

function createFabricCanvas(canvasEl, options = {}) {
  return new fabric.Canvas(canvasEl, { selection: true, preserveObjectStacking: true, ...options });
}

function createTextObject(element, canvasWidth) {
  const text = new fabric.Textbox(element.defaultValue || '', {
    left: element.x, top: element.y,
    width: element.maxWidth || canvasWidth * 0.7,
    fontSize: element.fontSize, fontFamily: element.fontFamily,
    fontWeight: element.fontWeight, fontStyle: element.fontStyle,
    fill: element.color, textAlign: element.align, lineHeight: element.lineHeight,
    originX: element.align === 'center' ? 'center' : element.align === 'right' ? 'right' : 'left',
    originY: 'top', selectable: true, evented: true, editable: false,
    hasControls: true, hasBorders: true, perPixelTargetFind: true, targetFindTolerance: 4
  });
  text.set({ data: { ...element } });
  return text;
}

function elementToFabric(element, canvasWidth, imagesCache) {
  if (element.type === 'text') return createTextObject(element, canvasWidth);
  if (element.type === 'image' && element.imageSrc) {
    const img = imagesCache.get(element.imageSrc);
    if (img) {
      const obj = new fabric.Image(img, {
        left: element.x, top: element.y,
        width: element.width, height: element.height,
        scaleX: element.scaleX || 1, scaleY: element.scaleY || 1,
        angle: element.angle || 0, originX: 'left', originY: 'top',
        selectable: true, evented: true, hasControls: true, hasBorders: true
      });
      obj.set({ data: { ...element } });
      return obj;
    }
  }
  return null;
}

function renderTemplateToCanvas(template, dataRow, imagesCache) {
  const { canvasSize, elements } = template;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  const bgImg = template.backgroundImage && imagesCache.get(template.backgroundImage);
  if (bgImg) ctx.drawImage(bgImg, 0, 0, canvasSize.width, canvasSize.height);

  for (const element of elements) {
    const value = element.binding && dataRow[element.binding] !== undefined && dataRow[element.binding] !== ''
      ? String(dataRow[element.binding])
      : element.defaultValue || '';

    if (element.type === 'image' && element.imageSrc) {
      const img = imagesCache.get(element.imageSrc);
      if (img) {
        ctx.save();
        const w = (element.width || img.naturalWidth) * (element.scaleX || 1);
        const h = (element.height || img.naturalHeight) * (element.scaleY || 1);
        if (element.angle) {
          ctx.translate(element.x, element.y);
          ctx.rotate(element.angle * Math.PI / 180);
          ctx.drawImage(img, 0, 0, w, h);
        } else {
          ctx.drawImage(img, element.x, element.y, w, h);
        }
        ctx.restore();
      }
      continue;
    }

    if (element.type !== 'text' || !value) continue;
    ctx.font = `${element.fontStyle || 'normal'} ${element.fontWeight || 'normal'} ${element.fontSize}px "${element.fontFamily}"`;
    ctx.fillStyle = element.color || '#000000';
    ctx.textAlign = element.align || 'left';
    ctx.textBaseline = 'top';

    const maxWidth = element.maxWidth || (canvasSize.width - element.x - 20);
    const words = value.split(' ');
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

    const lineHeight = element.fontSize * (element.lineHeight || 1.2);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], element.x, element.y + i * lineHeight);
    }
  }
  return canvas;
}

export default function SimpleMode() {
  const [view, setView] = useState('design');
  const [template, setTemplate] = useState(() => createDefaultTemplate());
  const [backgroundDataUrl, setBackgroundDataUrl] = useState(null);
  const [data, setData] = useState({ headers: [], rows: [] });
  const [dataFile, setDataFile] = useState(null);
  const [outputFolder, setOutputFolder] = useState('');
  const [exportFormat, setExportFormat] = useState('png');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [notice, setNotice] = useState(null);
  const [fonts, setFonts] = useState({ bundled: [], user: [] });
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);

  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const imagesCacheRef = useRef(new Map());
  const templateRef = useRef(template);
  templateRef.current = template;

  const computeZoom = useCallback((size) => {
    const wrap = wrapperRef.current;
    if (!wrap) return 1;
    const availW = wrap.clientWidth - 40;
    const availH = wrap.clientHeight - 40;
    if (availW <= 0 || availH <= 0) return 1;
    return Math.min(availW / size.width, availH / size.height, 1);
  }, []);

  const setTemplateAndRender = (updater) => {
    setTemplate((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      scheduleRender(next);
      return next;
    });
  };

  const scheduleRender = useCallback((nextTemplate) => {
    requestAnimationFrame(() => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      const keepSelectedId = active && active.data && active.data.id ? active.data.id : null;
      canvas.clear();
      canvas.backgroundColor = '#ffffff';
      const size = nextTemplate.canvasSize;
      const zoom = computeZoom(size);
      canvas.setZoom(zoom);
      canvas.setDimensions({ width: Math.round(size.width * zoom), height: Math.round(size.height * zoom) });
      const bgPath = nextTemplate.backgroundImage;
      if (bgPath && imagesCacheRef.current.has(bgPath)) {
        const fabricImg = new fabric.Image(imagesCacheRef.current.get(bgPath), {
          left: 0, top: 0,
          width: nextTemplate.canvasSize.width,
          height: nextTemplate.canvasSize.height,
          selectable: false, evented: false,
          lockMovementX: true, lockMovementY: true,
          hasControls: false, hasBorders: false
        });
        canvas.add(fabricImg);
        canvas.sendToBack(fabricImg);
      }
      nextTemplate.elements.forEach((element) => {
        const obj = elementToFabric(element, nextTemplate.canvasSize.width, imagesCacheRef.current);
        if (obj) canvas.add(obj);
      });
      if (keepSelectedId) {
        const reselect = canvas.getObjects().find((o) => o.data && o.data.id === keepSelectedId);
        if (reselect) canvas.setActiveObject(reselect);
      }
      canvas.renderAll();
    });
  }, [computeZoom]);

  useEffect(() => {
    const onResize = () => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;
      const size = templateRef.current.canvasSize;
      const zoom = computeZoom(size);
      canvas.setZoom(zoom);
      canvas.setDimensions({ width: Math.round(size.width * zoom), height: Math.round(size.height * zoom) });
      canvas.renderAll();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeZoom]);

  useEffect(() => {
    (async () => {
      try {
        const fontList = await window.api.font.list();
        setFonts(fontList);
        for (const family of [...fontList.bundled, ...fontList.user]) {
          for (const face of family.faces) {
            try {
              const dataUrl = await window.api.fs.readAsDataUrl(face.path);
              const ff = new FontFace(family.name, `url(${dataUrl})`, { weight: face.weight, style: face.style });
              await ff.load();
              document.fonts.add(ff);
            } catch (e) { window.__fontErrors = (window.__fontErrors || []).concat(family.name + ': ' + e.message); }
          }
        }
      } catch (err) {
        console.error('Failed to load fonts:', err);
      }
      scheduleRender(templateRef.current);
    })();
  }, [scheduleRender]);

  const initFabricCanvas = useCallback(() => {
    if (!canvasRef.current) return;
    if (fabricCanvasRef.current) {
      if (fabricCanvasRef.current.lowerCanvasEl === canvasRef.current) return;
      try { fabricCanvasRef.current.dispose(); } catch { /* stale instance */ }
      fabricCanvasRef.current = null;
    }
    {
      const canvas = createFabricCanvas(canvasRef.current, {
        width: templateRef.current.canvasSize.width,
        height: templateRef.current.canvasSize.height,
        backgroundColor: '#ffffff'
      });
      fabricCanvasRef.current = canvas;
      window.__fabric = canvas;

      const syncSelection = (obj) => {
        setSelectedElementId(obj && obj.data && obj.data.id ? obj.data.id : null);
      };
      canvas.on('selection:created', (e) => syncSelection(e.selected && e.selected[0]));
      canvas.on('selection:updated', (e) => syncSelection(e.selected && e.selected[0]));
      canvas.on('selection:cleared', () => setSelectedElementId(null));

      const syncPosition = (target) => {
        if (!target || !target.data || !target.data.id) return;
        const id = target.data.id;
        setTemplate((prev) => {
          const next = cloneTemplate(prev);
          const el = getElementById(next, id);
          if (el) {
            el.x = Math.round(target.left);
            el.y = Math.round(target.top);
            if (el.type === 'text') {
              el.maxWidth = Math.round(target.width);
              el.fontSize = Math.round(target.fontSize);
            }
          }
          return next;
        });
      };
      canvas.on('object:moving', (e) => syncPosition(e.target));
      canvas.on('object:scaling', (e) => syncPosition(e.target));

      scheduleRender(templateRef.current);
    }
  }, [scheduleRender]);

  useEffect(() => { initFabricCanvas(); }, [initFabricCanvas, view]);

  const handleBackgroundUpload = async () => {
    const filePath = await window.api.dialog.openImage();
    if (!filePath) return;
    try {
      const dataUrl = await window.api.fs.readAsDataUrl(filePath);
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      imagesCacheRef.current.set(filePath, img);
      setBackgroundDataUrl(dataUrl);
      setTemplateAndRender((prev) => {
        const next = cloneTemplate(prev);
        next.backgroundImage = filePath;
        return applyBackgroundSize(next, img.naturalWidth, img.naturalHeight);
      });
      setNotice(null);
    } catch (err) {
      setNotice({ type: 'error', text: `Failed to load image: ${err.message}` });
    }
  };

  const handleDataFileUpload = async () => {
    const filePath = await window.api.dialog.openDataFile();
    if (!filePath) return;
    try {
      const ext = filePath.toLowerCase();
      const result = ext.endsWith('.csv')
        ? await window.api.data.parseCSV(filePath)
        : await window.api.data.parseExcel(filePath);
      setDataFile(filePath);
      setData(result);

      const extraColumns = result.headers.filter(
        (h) => h !== 'student_name' && h !== 'roll_no' && h !== 'name' && h !== 'id'
      );
      setNotice(
        extraColumns.length > 0
          ? { type: 'info', text: `Columns detected: ${extraColumns.join(', ')}. Use Advanced mode to bind them.` }
          : { type: 'info', text: `Loaded ${result.rows.length} rows.` }
      );
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleOutputFolderSelect = async () => {
    const folder = await window.api.dialog.selectOutputFolder();
    if (folder) setOutputFolder(folder);
  };

  const handleExport = async () => {
    if (!template.backgroundImage) return setNotice({ type: 'error', text: 'Upload a template image first.' });
    if (!outputFolder) return setNotice({ type: 'error', text: 'Select an output folder first.' });
    if (data.rows.length === 0) return setNotice({ type: 'error', text: 'Import a CSV/Excel file first.' });

    setIsExporting(true);
    setExportProgress({ current: 0, total: data.rows.length });
    setNotice(null);
    try {
      const result = await window.api.export.batch({
        template: cloneTemplate(template),
        data,
        outputFolder,
        format: exportFormat,
        onProgress: (progress) => setExportProgress(progress)
      });
      const msg = result.cancelled
        ? `Export cancelled. ${result.results.length} file(s) written.`
        : `Export complete: ${result.results.length} certificate(s).`;
      setNotice({
        type: result.errors.length ? 'info' : 'info',
        text: result.errors.length ? `${msg} ${result.errors.length} row(s) failed.` : msg
      });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancelExport = () => {
    window.api.export.cancel();
  };

  const updateElementFont = (id, updates) => {
    setTemplateAndRender((prev) => {
      const next = cloneTemplate(prev);
      updateElement(next, id, updates);
      return next;
    });
  };

  const selectedElement = template.elements.find((el) => el.id === selectedElementId) || null;

  return (
    <>
      <div className="subtoolbar">
        <button className={`mode-tab ${view === 'design' ? 'active' : ''}`} onClick={() => setView('design')}>
          Design
        </button>
        <button className={`mode-tab ${view === 'preview' ? 'active' : ''}`} onClick={() => setView('preview')}>
          Preview
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Exporting...' : 'Export Certificates'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside className="panel" style={{ width: 300, flexShrink: 0 }}>
          <div className="panel-header">Template</div>
          <div className="panel-content">
            <div className="section">
              <div className="section-title">Background Image</div>
              <div
                className={`drag-area ${backgroundDataUrl ? 'has-image' : ''}`}
                onClick={handleBackgroundUpload}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('active'); }}
                onDragLeave={(e) => e.currentTarget.classList.remove('active')}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('active'); handleBackgroundUpload(); }}
              >
                {backgroundDataUrl ? (
                  <img src={backgroundDataUrl} alt="Template" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 4 }} />
                ) : (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                    <div>Click to upload template image</div>
                    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>PNG, JPG, WebP</div>
                  </>
                )}
              </div>
            </div>

            <div className="section">
              <div className="section-title">Data Source</div>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleDataFileUpload}>
                {dataFile ? `${dataFile.split(/[\\/]/).pop()} (${data.rows.length} rows)` : 'Import CSV / Excel'}
              </button>
              {data.rows.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Columns: {data.headers.join(', ')}
                </div>
              )}
            </div>

            <div className="section">
              <div className="section-title">Output</div>
              <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 8 }} onClick={handleOutputFolderSelect}>
                {outputFolder ? outputFolder.split(/[\\/]/).slice(-2).join('/') : 'Select output folder'}
              </button>
              <div className="form-group">
                <label className="form-label">Export Format</label>
                <select className="form-input" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                  <option value="png">PNG images</option>
                  <option value="per-student-pdf">PDF per student</option>
                  <option value="merged-pdf">One merged PDF</option>
                </select>
              </div>
            </div>

            {notice && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 4,
                  fontSize: 13,
                  marginTop: 16,
                  background: notice.type === 'error' ? 'rgba(241,76,76,0.15)' : 'rgba(0,122,204,0.15)',
                  border: `1px solid ${notice.type === 'error' ? 'var(--error)' : 'var(--accent)'}`
                }}
              >
                {notice.text}
              </div>
            )}
          </div>
        </aside>

        <main className="canvas-container" style={{ flex: 1 }}>
          {view === 'design' ? (
            <>
              <div className="canvas-wrapper" ref={wrapperRef}>
                <canvas ref={canvasRef} className="canvas-stage" />
              </div>
              {selectedElement && selectedElement.type === 'text' && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
                      <label className="form-label">Font Family</label>
                      <select className="form-input" value={selectedElement.fontFamily} onChange={(e) => updateElementFont(selectedElement.id, { fontFamily: e.target.value })}>
                        {fonts.bundled.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                        {fonts.user.map((f) => <option key={f.name} value={f.name}>{f.name} (custom)</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 90 }}>
                      <label className="form-label">Font Size</label>
                      <input type="number" className="form-input" min="8" max="300" value={selectedElement.fontSize} onChange={(e) => updateElementFont(selectedElement.id, { fontSize: parseInt(e.target.value, 10) || 8 })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 80 }}>
                      <label className="form-label">Color</label>
                      <input type="color" className="color-picker" value={selectedElement.color} onChange={(e) => updateElementFont(selectedElement.id, { color: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
                      <label className="form-label">Alignment</label>
                      <select className="form-input" value={selectedElement.align} onChange={(e) => updateElementFont(selectedElement.id, { align: e.target.value })}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, overflow: 'auto' }}>
              {data.rows.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 60 }}>
                  Import a data file to preview real values.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label className="form-label">Preview Row</label>
                    <select className="form-input" style={{ maxWidth: 320 }} value={previewRowIndex} onChange={(e) => setPreviewRowIndex(parseInt(e.target.value, 10))}>
                      {data.rows.map((row, i) => (
                        <option key={i} value={i}>
                          {row.student_name || row.name || row.roll_no || `Row ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                    <canvas
                      ref={(el) => {
                        if (!el) return;
                        const previewCanvas = renderTemplateToCanvas(template, data.rows[previewRowIndex] || {}, imagesCacheRef.current);
                        el.width = previewCanvas.width;
                        el.height = previewCanvas.height;
                        el.getContext('2d').drawImage(previewCanvas, 0, 0);
                      }}
                      className="canvas-stage"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {isExporting && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <div className="modal-title">Exporting Certificates</div>
                </div>
                <div>
                  <div style={{ marginBottom: 8 }}>{exportProgress.current} / {exportProgress.total}</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${exportProgress.total ? (exportProgress.current / exportProgress.total) * 100 : 0}%` }} />
                  </div>
                  <button className="btn btn-secondary" style={{ marginTop: 16, width: '100%' }} onClick={handleCancelExport}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className="panel" style={{ width: 240, flexShrink: 0 }}>
          <div className="panel-header">Elements</div>
          <div className="panel-content">
            {template.elements.map((element) => (
              <div
                key={element.id}
                className="file-item"
                style={{
                  background: selectedElementId === element.id ? 'rgba(0,122,204,0.2)' : 'var(--bg-tertiary)',
                  border: selectedElementId === element.id ? '1px solid var(--accent)' : 'none',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedElementId(element.id);
                  const canvas = fabricCanvasRef.current;
                  if (canvas) {
                    const obj = canvas.getObjects().find((o) => o.data && o.data.id === element.id);
                    if (obj) { canvas.setActiveObject(obj); canvas.renderAll(); }
                  }
                }}
              >
                <div className="file-item-info">
                  <div className="file-item-name">{element.binding === 'student_name' ? 'Name' : 'Roll No.'}</div>
                  <div className="file-item-meta">{element.fontFamily}, {element.fontSize}px</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}