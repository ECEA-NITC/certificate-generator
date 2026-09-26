import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fabric } from 'fabric';
import { createDefaultTemplate, cloneTemplate, updateElement, getElementById, addElement, removeElement, applyBackgroundSize } from '../shared/templateSchema';

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

function createImageObject(element, img) {
  const obj = new fabric.Image(img, {
    left: element.x, top: element.y,
    width: element.width || img.naturalWidth, height: element.height || img.naturalHeight,
    scaleX: element.scaleX || 1, scaleY: element.scaleY || 1,
    angle: element.angle || 0, originX: 'left', originY: 'top',
    selectable: true, evented: true, hasControls: true, hasBorders: true
  });
  obj.set({ data: { ...element } });
  return obj;
}

function elementToFabric(element, canvasWidth, imagesCache) {
  if (element.type === 'text') return createTextObject(element, canvasWidth);
  if (element.type === 'image' && element.imageSrc) {
    const img = imagesCache.get(element.imageSrc);
    if (img) return createImageObject(element, img);
  }
  return null;
}

export default function AdvancedMode() {
  const [tab, setTab] = useState('elements');
  const [template, setTemplate] = useState(() => createDefaultTemplate('Advanced Certificate'));
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
  const [showAddElement, setShowAddElement] = useState(false);
  const [newElementType, setNewElementType] = useState('text');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState([]);

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

  const setTemplateAndRender = (updater) => {
    setTemplate((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      scheduleRender(next);
      return next;
    });
  };

  const loadAllFonts = useCallback(async () => {
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
          } catch (e) { /* fallback to system font */ }
        }
      }
    } catch (err) {
      console.error('Failed to load fonts:', err);
    }
    scheduleRender(templateRef.current);
  }, [scheduleRender]);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await window.api.template.list());
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  }, []);

  useEffect(() => { loadAllFonts(); loadTemplates(); }, [loadAllFonts, loadTemplates]);

  const initFabricCanvas = useCallback(() => {
    if (canvasRef.current && !fabricCanvasRef.current) {
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

      const syncTransform = (target) => {
        if (!target || !target.data || !target.data.id) return;
        const id = target.data.id;
        setTemplate((prev) => {
          const next = cloneTemplate(prev);
          const el = getElementById(next, id);
          if (el) {
            el.x = Math.round(target.left);
            el.y = Math.round(target.top);
            el.angle = Math.round(target.angle || 0);
            if (el.type === 'text') {
              el.maxWidth = Math.round(target.width);
              el.fontSize = Math.round(target.fontSize);
            } else if (el.type === 'image') {
              el.scaleX = target.scaleX;
              el.scaleY = target.scaleY;
              el.width = target.width;
              el.height = target.height;
            }
          }
          return next;
        });
      };
      canvas.on('object:moving', (e) => syncTransform(e.target));
      canvas.on('object:scaling', (e) => syncTransform(e.target));
      canvas.on('object:rotating', (e) => syncTransform(e.target));

      scheduleRender(templateRef.current);
    }
  }, [scheduleRender]);

  useEffect(() => { initFabricCanvas(); }, [initFabricCanvas]);

  const updateElementProperty = (id, updates) => {
    setTemplateAndRender((prev) => {
      const next = cloneTemplate(prev);
      updateElement(next, id, updates);
      return next;
    });
  };

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
      setNotice({ type: 'info', text: `Loaded ${result.rows.length} rows, ${result.headers.length} columns.` });
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
        type: 'info',
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

  const handleAddElement = () => {
    const newElement = {
      type: newElementType,
      binding: '',
      x: template.canvasSize.width / 2,
      y: template.canvasSize.height / 2,
      fontFamily: 'Noto Serif',
      fontSize: 32,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#222222',
      align: 'center',
      maxWidth: template.canvasSize.width * 0.5,
      lineHeight: 1.2,
      defaultValue: newElementType === 'text' ? 'New Text' : '',
      width: 200,
      height: 200,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      imageSrc: null
    };
    setTemplateAndRender((prev) => {
      const next = cloneTemplate(prev);
      addElement(next, newElement);
      return next;
    });
    setShowAddElement(false);
  };

  const handleDeleteElement = () => {
    if (!selectedElementId) return;
    setTemplateAndRender((prev) => {
      const next = cloneTemplate(prev);
      removeElement(next, selectedElementId);
      return next;
    });
    setSelectedElementId(null);
  };

  const handleImageUpload = async () => {
    if (!selectedElementId) return;
    const filePath = await window.api.dialog.openImage();
    if (!filePath) return;
    try {
      const dataUrl = await window.api.fs.readAsDataUrl(filePath);
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      imagesCacheRef.current.set(dataUrl, img);
      updateElementProperty(selectedElementId, {
        imageSrc: dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    } catch (err) {
      setNotice({ type: 'error', text: `Failed to load image: ${err.message}` });
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      const toSave = cloneTemplate(template);
      toSave.name = templateName.trim();
      await window.api.template.save(toSave);
      setShowTemplateModal(false);
      setTemplateName('');
      loadTemplates();
      setNotice({ type: 'info', text: `Template "${toSave.name}" saved.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleLoadTemplate = async (entry) => {
    try {
      const loaded = typeof entry === 'string' ? await window.api.template.load(entry) : await window.api.template.load(entry.filePath);
      imagesCacheRef.current.clear();
      if (loaded.backgroundImage) {
        try {
          const dataUrl = await window.api.fs.readAsDataUrl(loaded.backgroundImage);
          const img = new Image();
          img.src = dataUrl;
          await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
          imagesCacheRef.current.set(loaded.backgroundImage, img);
          setBackgroundDataUrl(dataUrl);
        } catch { /* keep template without visible bg */ }
      }
      setTemplate(loaded);
      templateRef.current = loaded;
      setTemplateName(loaded.name || '');
      setShowTemplateModal(false);
      scheduleRender(loaded);
      setNotice({ type: 'info', text: `Loaded "${loaded.name}".` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleInstallFont = async () => {
    const filePath = await window.api.dialog.openFontFile();
    if (!filePath) return;
    try {
      await window.api.font.install(filePath);
      await loadAllFonts();
      setNotice({ type: 'info', text: 'Font installed.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const selectedElement = template.elements.find((el) => el.id === selectedElementId) || null;

  return (
    <>
      <div className="subtoolbar">
        <button className={`mode-tab ${tab === 'elements' ? 'active' : ''}`} onClick={() => setTab('elements')}>Elements</button>
        <button className={`mode-tab ${tab === 'canvas' ? 'active' : ''}`} onClick={() => setTab('canvas')}>Canvas</button>
        <button className={`mode-tab ${tab === 'data' ? 'active' : ''}`} onClick={() => setTab('data')}>Data</button>
        <button className={`mode-tab ${tab === 'export' ? 'active' : ''}`} onClick={() => setTab('export')}>Export</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => setShowTemplateModal(true)}>Templates</button>
        <button className="btn btn-primary" onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Exporting...' : 'Export'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside className="panel" style={{ width: 280, flexShrink: 0 }}>
          <div className="panel-header">
            {tab === 'elements' && 'Elements'}
            {tab === 'canvas' && 'Canvas Settings'}
            {tab === 'data' && 'Data Source'}
            {tab === 'export' && 'Export Settings'}
          </div>
          <div className="panel-content">
            {tab === 'elements' && (
              <>
                <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={() => setShowAddElement(true)}>
                  + Add Element
                </button>
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
                      <div className="file-item-name">
                        {element.type === 'image' ? 'Image' : (element.binding || 'Static text')}
                      </div>
                      <div className="file-item-meta">
                        {element.type === 'text'
                          ? `${element.fontFamily}, ${element.fontSize}px`
                          : `${Math.round(element.width || 0)}×${Math.round(element.height || 0)}`}
                      </div>
                    </div>
                    <button
                      className="btn btn-icon"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedElementId(element.id);
                        setTimeout(() => {
                          setTemplateAndRender((prev) => {
                            const next = cloneTemplate(prev);
                            removeElement(next, element.id);
                            return next;
                          });
                        }, 0);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </>
            )}

            {tab === 'canvas' && (
              <>
                <div className="section">
                  <div className="section-title">Canvas Size</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Width</label>
                      <input
                        type="number" className="form-input" min="100" max="5000"
                        value={template.canvasSize.width}
                        onChange={(e) => setTemplateAndRender((prev) => {
                          const n = cloneTemplate(prev);
                          n.canvasSize.width = parseInt(e.target.value, 10) || 100;
                          return n;
                        })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Height</label>
                      <input
                        type="number" className="form-input" min="100" max="5000"
                        value={template.canvasSize.height}
                        onChange={(e) => setTemplateAndRender((prev) => {
                          const n = cloneTemplate(prev);
                          n.canvasSize.height = parseInt(e.target.value, 10) || 100;
                          return n;
                        })}
                      />
                    </div>
                  </div>
                </div>
                <div className="section">
                  <div className="section-title">Background Image</div>
                  <div className={`drag-area ${backgroundDataUrl ? 'has-image' : ''}`} onClick={handleBackgroundUpload}>
                    {backgroundDataUrl ? (
                      <img src={backgroundDataUrl} alt="Template" style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 4 }} />
                    ) : (
                      <>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                        <div>Click to upload background</div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {tab === 'data' && (
              <>
                <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 8 }} onClick={handleDataFileUpload}>
                  {dataFile ? `${dataFile.split(/[\\/]/).pop()} (${data.rows.length} rows)` : 'Import CSV / Excel'}
                </button>
                {data.rows.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>Columns: {data.headers.join(', ')}</div>
                    <div style={{ fontSize: 11 }}>
                      {data.rows.slice(0, 3).map((row, i) => (
                        <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                          {Object.entries(row).slice(0, 3).map(([k, v]) => (
                            <span key={k} style={{ marginRight: 8 }}>{k}: {String(v)}</span>
                          ))}
                        </div>
                      ))}
                      {data.rows.length > 3 && <div>… {data.rows.length - 3} more rows</div>}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'export' && (
              <>
                <div className="section">
                  <div className="section-title">Output Folder</div>
                  <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 8 }} onClick={handleOutputFolderSelect}>
                    {outputFolder ? outputFolder.split(/[\\/]/).slice(-2).join('/') : 'Select output folder'}
                  </button>
                </div>
                <div className="section">
                  <div className="section-title">Export Format</div>
                  <select className="form-input" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                    <option value="png">PNG images</option>
                    <option value="per-student-pdf">PDF per student</option>
                    <option value="merged-pdf">One merged PDF</option>
                  </select>
                </div>
              </>
            )}

            {notice && (
              <div
                style={{
                  padding: '12px', borderRadius: 4, fontSize: 13, marginTop: 16,
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
          <div className="canvas-wrapper" ref={wrapperRef}>
            <canvas ref={canvasRef} className="canvas-stage" />
          </div>

          {selectedElement && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
                  <label className="form-label">Font Family</label>
                  <select className="form-input" value={selectedElement.fontFamily || ''} onChange={(e) => updateElementProperty(selectedElement.id, { fontFamily: e.target.value })} disabled={selectedElement.type !== 'text'}>
                    {fonts.bundled.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                    {fonts.user.map((f) => <option key={f.name} value={f.name}>{f.name} (custom)</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 90 }}>
                  <label className="form-label">Font Size</label>
                  <input type="number" className="form-input" min="8" max="300" value={selectedElement.fontSize || 32} onChange={(e) => updateElementProperty(selectedElement.id, { fontSize: parseInt(e.target.value, 10) || 8 })} disabled={selectedElement.type !== 'text'} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 80 }}>
                  <label className="form-label">Color</label>
                  <input type="color" className="color-picker" value={selectedElement.color || '#222222'} onChange={(e) => updateElementProperty(selectedElement.id, { color: e.target.value })} disabled={selectedElement.type !== 'text'} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
                  <label className="form-label">Alignment</label>
                  <select className="form-input" value={selectedElement.align || 'left'} onChange={(e) => updateElementProperty(selectedElement.id, { align: e.target.value })} disabled={selectedElement.type !== 'text'}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                {selectedElement.type === 'text' && (
                  <>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
                      <label className="form-label">Binding (CSV column)</label>
                      <select className="form-input" value={selectedElement.binding || ''} onChange={(e) => updateElementProperty(selectedElement.id, { binding: e.target.value || undefined })}>
                        <option value="">Static text</option>
                        {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                      <label className="form-label">Default / placeholder</label>
                      <input type="text" className="form-input" value={selectedElement.defaultValue || ''} onChange={(e) => updateElementProperty(selectedElement.id, { defaultValue: e.target.value })} />
                    </div>
                  </>
                )}
                {selectedElement.type === 'image' && (
                  <button className="btn btn-secondary" onClick={handleImageUpload}>Upload image</button>
                )}
                <button className="btn btn-secondary" onClick={handleDeleteElement} style={{ marginLeft: 'auto' }}>
                  Delete element
                </button>
              </div>
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

          {showAddElement && (
            <div className="modal-overlay" onClick={() => setShowAddElement(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-title">Add Element</div>
                  <button className="modal-close" onClick={() => setShowAddElement(false)}>×</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Element Type</label>
                  <select className="form-input" value={newElementType} onChange={(e) => setNewElementType(e.target.value)}>
                    <option value="text">Text box</option>
                    <option value="image">Image</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setShowAddElement(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAddElement}>Add</button>
                </div>
              </div>
            </div>
          )}

          {showTemplateModal && (
            <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
              <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-title">Templates</div>
                  <button className="modal-close" onClick={() => setShowTemplateModal(false)}>×</button>
                </div>
                <div className="section">
                  <div className="section-title">Save Current Template</div>
                  <input type="text" className="form-input" placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                  <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={handleSaveTemplate}>Save Template</button>
                </div>
                <div className="section">
                  <div className="section-title">Saved Templates</div>
                  {templates.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No templates saved yet</div>
                  ) : (
                    templates.map((t) => (
                      <div key={t.filePath} className="file-item" style={{ cursor: 'pointer' }} onClick={() => handleLoadTemplate(t)}>
                        <div className="file-item-info">
                          <div className="file-item-name">{t.name}</div>
                        </div>
                        <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); handleLoadTemplate(t); }}>Load</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className="panel" style={{ width: 230, flexShrink: 0 }}>
          <div className="panel-header">Fonts</div>
          <div className="panel-content">
            <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 12 }} onClick={handleInstallFont}>
              + Add custom font
            </button>
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              {fonts.bundled.map((f) => (
                <div key={f.name} className="font-option" style={{ fontFamily: f.name }}>
                  <span>{f.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>bundled</span>
                </div>
              ))}
              {fonts.user.map((f) => (
                <div key={f.name} className="font-option" style={{ fontFamily: f.name }}>
                  <span>{f.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 'auto' }}>custom</span>
                </div>
              ))}
              {fonts.bundled.length + fonts.user.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No fonts available</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}