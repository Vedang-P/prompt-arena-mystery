import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useCaseDialog } from './InvestigationUI.jsx';
const SettingsContext = createContext({ quality: 'medium', sound: false, narration: false });
const read = () => {
  try { return JSON.parse(localStorage.getItem('moon-settings') || '{}'); } catch { return {}; }
};
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ quality: window.innerWidth < 700 ? 'low' : 'medium', sound: false, narration: false, ...read() }));
  useEffect(() => { try { localStorage.setItem('moon-settings', JSON.stringify(settings)); } catch {} }, [settings]);
  return <SettingsContext.Provider value={{ ...settings, update: (value) => setSettings((s) => ({ ...s, ...value })) }}>{children}</SettingsContext.Provider>;
}
export const useSettings = () => useContext(SettingsContext);

export function SettingsPanel({ onClose }) {
  const { quality, sound, narration, update } = useSettings();
  const panelRef = useRef(null);
  useCaseDialog(panelRef, onClose);
  return <div className="case-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="case-panel settings-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Audio and settings">
      <header className="case-panel-head">
        <div><p className="case-eyebrow">Prompt Arena / Options</p><h2>Audio &amp; settings</h2></div>
        <button className="case-close" onClick={onClose} aria-label="Close settings">×</button>
      </header>
      <div className="case-reading-scroll">
        <label className="settings-row">Graphics<select value={quality} onChange={(e) => update({ quality: e.target.value })}>
          <option value="low">Low · battery friendly</option><option value="medium">Balanced</option><option value="high">High · shadows & bloom</option>
        </select></label>
        <label className="settings-row">Ambient soundtrack<input type="checkbox" checked={sound} onChange={(e) => update({ sound: e.target.checked })} /></label>
        <label className="settings-row">Narrator & character voices<input type="checkbox" checked={narration} onChange={(e) => update({ narration: e.target.checked })} /></label>
        <p className="case-muted">Every act and authored character reply uses bundled Kokoro neural recordings. Subtitles are always on. No voice service or model download is needed while playing.</p>
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
