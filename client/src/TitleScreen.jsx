import { lazy, Suspense, useState } from 'react';
const Cinema=lazy(()=>import('./Cinema.jsx'));
import { useSettings } from './Settings.jsx';
import LogoutButton from './LogoutButton.jsx';
import MuteButton from './MuteButton.jsx';
const TITLE_CAST=[{character:'sameer',at:[-.54,.99],pose:'sit'},{character:'parth',at:[.54,.99],pose:'sit'}];
export default function TitleScreen({config,state,busy,error,onGuest,onResume,onDevLogin,onSettings,onLeaderboard}) {
  const [entry,setEntry]=useState(false),[code,setCode]=useState('');
  const {update}=useSettings();
  const enter=()=>{update({sound:true,narration:true});if(state)onResume();else setEntry(true);};
  return <main className="title-screen arena-title">
    <Suspense fallback={<div className="title-world" aria-hidden="true"/>}><div className="title-world"><Cinema sceneId="gazebo" shot="two" cast={TITLE_CAST}/></div></Suspense><div className="title-shade"/>
    <header className="title-header"><span className="brand">◒ Prompt Arena</span><div className="arena-account-actions"><button className="quiet-button" onClick={onLeaderboard}>Live leaderboard ↗</button><button className="quiet-button" onClick={onSettings}>Audio & settings</button><MuteButton/>{state && <LogoutButton disabled={busy}/>}</div></header>
    <div className="title-content"><p className="eyebrow">A disappearance. A voice. A trail of secrets.</p><h1>Prompt<br/>Arena<span className="title-period">.</span></h1><p className="title-description">The Moon’s Dark Side</p><button className="primary-play" onClick={enter} disabled={busy}><span>{state?'Continue':'Enter'}<small>{state?state.team:'Open your team’s case'}</small></span><span>→</span></button></div>
    <footer className="title-footer"><span>An interactive mystery</span></footer>
    {entry&&<div className="modal-backdrop" onClick={()=>setEntry(false)}><section className="entry-card" role="dialog" aria-modal="true" aria-label="Team entry" onClick={e=>e.stopPropagation()}><p className="eyebrow">Your table. Your case.</p><h2>Enter the arena</h2><p>Use the team code supplied by your invigilator.</p><form onSubmit={e=>{e.preventDefault();update({sound:true,narration:true});onDevLogin(code);}}><label htmlFor="team-code">Team code</label><input id="team-code" autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} placeholder="Enter assigned code" required maxLength={48}/><button className="btn brass" disabled={busy||!code.trim()}>{busy?'Opening your case…':'Begin →'}</button></form>{error&&<p className="title-error" role="alert">{error}</p>}{!config?.eventMode&&<button className="quiet-button" onClick={onGuest} disabled={busy}>Preview without a team code</button>}<button className="quiet-button" onClick={()=>setEntry(false)}>Back</button></section></div>}
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
