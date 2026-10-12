import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useCaseDialog } from './InvestigationUI.jsx';
const SettingsContext = createContext({ quality: 'medium', sound: false, autoTune: true });
const read = () => {
  try { return JSON.parse(localStorage.getItem('moon-settings') || '{}'); } catch { return {}; }
};

// Integrated GPUs, tiny machines and low-memory laptops cannot hold the
// balanced preset; they start on low instead of stuttering through it. The
// renderer string is the most reliable signal available to the browser.
const WEAK_GPU = /(hd|uhd) graphics|intel\(r\) gma|mali-|adreno [1-5]\d\d|powervr|swiftshader|llvmpipe|software rasterizer|basic render/i;

function detectQuality() {
  try {
    if (window.innerWidth < 700) return 'low';
    const cores = navigator.hardwareConcurrency;
    const memory = navigator.deviceMemory;
    if ((cores && cores <= 4) || (memory && memory <= 4)) return 'low';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) return 'low';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (gpu && WEAK_GPU.test(gpu)) return 'low';
  } catch {}
  return 'medium';
}

const initialSettings = () => {
  const stored = read();
  const base = { quality: stored.quality ? 'medium' : detectQuality(), sound: false, autoTune: true };
  return { ...base, ...stored };
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(initialSettings);
  useEffect(() => { try { localStorage.setItem('moon-settings', JSON.stringify(settings)); } catch {} }, [settings]);
  return <SettingsContext.Provider value={{ ...settings, update: (value) => setSettings((s) => ({ ...s, ...value })) }}>{children}</SettingsContext.Provider>;
}
export const useSettings = () => useContext(SettingsContext);

export function SettingsPanel({ onClose }) {
  const { quality, sound, autoTune, update } = useSettings();
  const panelRef = useRef(null);
  useCaseDialog(panelRef, onClose);
  return <div className="case-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="case-panel settings-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Audio and settings">
      <header className="case-panel-head">
        <div><p className="case-eyebrow">Prompt Arena / Options</p><h2>Audio &amp; settings</h2></div>
        <button className="case-close" onClick={onClose} aria-label="Close settings">×</button>
      </header>
      <div className="case-reading-scroll">
        <label className="settings-row">Graphics<select value={quality} onChange={(e) => update({ quality: e.target.value, autoTune: false })}>
          <option value="low">Low · battery friendly</option><option value="medium">Balanced</option><option value="high">High · shadows & bloom</option>
        </select></label>
        {autoTune && <p className="case-muted">Graphics adjust automatically if this device cannot hold the frame rate.</p>}
        <label className="settings-row">Ambient soundtrack<input type="checkbox" checked={sound} onChange={(e) => update({ sound: e.target.checked })} /></label>
        <div className="controls-grid"><span>Look around</span><b>Drag / one finger</b><span>Move the camera</span><b>W A S D / arrow keys</b><span>Zoom</span><b>Scroll / pinch</b><span>Inspect an object</span><b>Click its marker</b><span>Close a panel</span><b>Esc</b></div>
        <p className="case-muted">Progress saves after each discovery and answer. Rooms also have an accessible “Explore” list.</p>
        <p className="case-muted"><a href="/credits.html" target="_blank" rel="noreferrer">Cast, music &amp; asset credits ↗</a></p>
      </div>
      <footer className="case-panel-foot">
        <p>Settings apply instantly</p>
        <button className="case-button primary" onClick={onClose}>Back to the case →</button>
      </footer>
    </section>
  </div>;
}
