import { useState } from 'react';
import Cinema from './Cinema.jsx';
import { useSettings } from './Settings.jsx';
const TITLE_CAST = [{ character: 'sameer', at: [-0.7, 0.1], pose: 'sit', rot: 0.35 }, { character: 'parth', at: [0.75, 0.05], pose: 'sit', rot: -0.35 }];
export default function TitleScreen({ config, state, busy, error, onGuest, onResume, onDevLogin, onSettings, onChapters }) {
  const [code, setCode] = useState('');
  const { sound, update } = useSettings();
  const current = state?.acts?.find((a) => a.id === state.act);
  return <main className={`title-screen ${state ? 'saved-case' : ''}`}>
    <div className="title-world"><Cinema sceneId="gazebo" shot="wide" cast={TITLE_CAST} /></div>
    <div className="title-shade" />
    <header className="title-header"><span className="brand"><span className="brand-moon">◒</span> PROMPT ARENA</span><span className="title-tag">AN INTERACTIVE MYSTERY</span><button className="quiet-button" onClick={onSettings}>Settings ↗</button></header>
    <div className="title-content">
      <p className="eyebrow"><span className="small-line" /> Every secret has an orbit</p>
      <h1>The Moon’s<br /><em>Dark Side.</em></h1>
      <p className="title-description">Your best friend has vanished.<br />His secrets are still here.</p>
      <p className="title-detail">Search the city. Decode what he left behind.<br />Follow the truth, wherever it takes you.</p>
      <div className="title-actions">
        {state && <button className="primary-play" onClick={onResume} disabled={busy}><span>{state.ending ? 'View your ending' : 'Continue investigation'}<small>{current?.kicker} · {current?.title}</small></span><span>↗</span></button>}
        <button className={state ? 'secondary-play' : 'primary-play'} onClick={onGuest} disabled={busy}><span>{busy ? 'Opening your case…' : state ? 'Start a new solo case' : 'Begin investigation'}{!state && <small>No account needed · progress saves automatically</small>}</span><span>→</span></button>
        {state && <button className="secondary-play" onClick={onChapters}>Chapter select <small>Play any act in a separate practice save</small></button>}
        {!state && config?.google && <a className="title-google" href="/api/auth/google">Continue with Google <span>→</span><small>Save under your Google profile</small></a>}
      </div>
      {error && <p className="title-error" role="alert">{error}</p>}
      {config?.devLogin && <details className="dev-signin"><summary>Team code</summary><form onSubmit={(e) => { e.preventDefault(); onDevLogin(code); }}><input aria-label="Team code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PANDA-7K2" /><button className="btn ghost" disabled={busy}>Enter</button></form></details>}
      <div className="title-facts"><span><b>09</b> acts</span><span><b>14</b> locations</span><span><b>46</b> puzzles</span></div>
    </div>
    <footer className="title-footer"><span>THE NIGHT IS ONLY JUST BEGINNING.</span><button className="quiet-button" onClick={() => update({ sound: !sound })}>{sound ? '◉ Sound on' : '◎ Enable sound'}</button><span className="title-genre">A story of friendship, obsession & the things we don’t see.</span></footer>
  </main>;
}

export function ChapterSelect({ acts, onSelect, onClose, busy, practice, onCampaign }) {
  return <div className="modal-backdrop" onClick={onClose}><section className="chapter-card" role="dialog" aria-modal="true" aria-label="Chapter selection" onClick={(e) => e.stopPropagation()}>
    <div className="chapter-head"><div><p className="eyebrow">Your case, your pace</p><h2>Choose a chapter</h2></div><button className="quiet-button" onClick={onClose}>Close ×</button></div>
    <p className="settings-note">Each chapter starts a separate practice save with the earlier evidence already collected. Your campaign save stays intact.</p>
    <div className="chapter-grid">{acts.map((act, i) => <button key={act.id} onClick={() => onSelect(act.id)} disabled={busy}><span className="chapter-number">{String(i).padStart(2, '0')}</span><span><small>{act.type === 'cinematic' ? 'Opening cinematic' : `${act.rooms?.length ?? 1} locations`}</small><strong>{act.title}</strong></span><span>↗</span></button>)}</div>
    {practice && <button className="btn brass" onClick={onCampaign} disabled={busy}>Return to campaign save</button>}
  </section></div>;
}

export function EvidenceCard({ clue, onClose }) {
  if (!clue) return null;
  return <div className="modal-backdrop" onClick={onClose}><article className="evidence-card" role="dialog" aria-modal="true" aria-label={clue.name} onClick={(e) => e.stopPropagation()}><p className="eyebrow">Exhibit logged · saved to notebook</p><h2>{clue.name}</h2><p className="evidence-description">{clue.description}</p>{clue.page && <img src={clue.page} alt={clue.name} />}<button className="btn brass" onClick={onClose}>Return to the room</button></article></div>;
}
