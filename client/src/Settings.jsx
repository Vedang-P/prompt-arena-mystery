import { createContext, useContext, useEffect, useState } from 'react';
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
  return <div className="modal-backdrop" onClick={onClose}><section className="settings-card" role="dialog" aria-modal="true" aria-label="Game settings" onClick={(e) => e.stopPropagation()}>
    <p className="eyebrow">Make yourself comfortable</p><h2>Settings & controls</h2>
    <label className="settings-row">Graphics<select value={quality} onChange={(e) => update({ quality: e.target.value })}>
      <option value="low">Low · battery friendly</option><option value="medium">Balanced</option><option value="high">High · shadows & bloom</option>
    </select></label>
    <label className="settings-row">Ambient soundtrack<input type="checkbox" checked={sound} onChange={(e) => update({ sound: e.target.checked })} /></label>
    <label className="settings-row">Narrator & character voices<input type="checkbox" checked={narration} onChange={(e) => update({ narration: e.target.checked })} /></label>
    <p className="settings-note">Every act and authored character reply uses bundled Kokoro neural recordings. Subtitles are always on. No voice service or model download is needed while playing.</p>
    <div className="controls-grid"><span>Look around</span><b>Drag / one finger</b><span>Move the camera</span><b>W A S D / arrow keys</b><span>Zoom</span><b>Scroll / pinch</b><span>Inspect an object</span><b>Click its marker</b><span>Close a panel</span><b>Esc</b></div>
    <p className="settings-note">Progress saves after each discovery and answer. Rooms also have an accessible “Explore” list.</p>
    <p className="settings-note"><a href="/credits.html" target="_blank" rel="noreferrer">Cast, music & asset credits ↗</a></p>
    <button className="btn brass" onClick={onClose}>Back to the case</button>
  </section></div>;
}
