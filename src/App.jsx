import React, { useState } from 'react';
import SimpleMode from './modes/SimpleMode';
import AdvancedMode from './modes/AdvancedMode';

export default function App() {
  const [mode, setMode] = useState('simple');

  return (
    <div className="app">
      <div className="toolbar">
        <div className="toolbar-left">
          <span style={{ fontWeight: 600, fontSize: 14 }}>Certificate Generator</span>
        </div>
        <div className="toolbar-center">
          <button className={`mode-tab ${mode === 'simple' ? 'active' : ''}`} onClick={() => setMode('simple')}>
            Simple
          </button>
          <button className={`mode-tab ${mode === 'advanced' ? 'active' : ''}`} onClick={() => setMode('advanced')}>
            Advanced
          </button>
        </div>
        <div className="toolbar-right">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v1.0.0</span>
        </div>
      </div>

      <div className="mode-root">
        {mode === 'simple' && <SimpleMode />}
        {mode === 'advanced' && <AdvancedMode />}
      </div>
    </div>
  );
}