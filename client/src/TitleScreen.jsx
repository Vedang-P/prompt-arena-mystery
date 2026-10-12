import { lazy, Suspense, useRef, useState } from 'react';
const Cinema=lazy(()=>import('./Cinema3D.jsx'));
import { useSettings } from './Settings.jsx';
import { useCaseDialog } from './InvestigationUI.jsx';
import LogoutButton from './LogoutButton.jsx';
import MuteButton from './MuteButton.jsx';
const TITLE_CAST=[{character:'sameer',at:[-.54,.99],pose:'sit'},{character:'parth',at:[.54,.99],pose:'sit'}];
export default function TitleScreen({config,state,busy,error,onGuest,onResume,onDevLogin,onSettings,onLeaderboard}) {
  const [entry,setEntry]=useState(false),[code,setCode]=useState('');
  const {sound,update}=useSettings();
  // Entering the arena arms the soundtrack — but never un-silences a player
  // who pressed Mute (that toggle leaves a stash behind).
  const armAudio=()=>{
    let silenced=false;
    try{ silenced=!sound&&!!localStorage.getItem('moon-settings-before-mute'); }catch{}
    if(!silenced) update({sound:true});
  };
  const enter=()=>{armAudio();if(state)onResume();else setEntry(true);};
  const codeLogin=!!(config?.devLogin||config?.eventMode);
  const googleLogin=!!config?.google;
  return <main className="title-screen arena-title">
    <Suspense fallback={<div className="title-world" aria-hidden="true"/>}><div className="title-world"><Cinema sceneId="gazebo" shot="two" cast={TITLE_CAST}/></div></Suspense><div className="title-shade"/>
    <header className="title-header"><span className="brand">◒ Prompt Arena</span><div className="arena-account-actions"><button className="quiet-button" onClick={onLeaderboard}>Live leaderboard ↗</button><button className="quiet-button" onClick={onSettings}>Audio & settings</button><MuteButton/>{state && <LogoutButton disabled={busy}/>}</div></header>
    <div className="title-content"><p className="eyebrow">A disappearance. A voice. A trail of secrets.</p><h1>Prompt<br/>Arena<span className="title-period">.</span></h1><p className="title-description">The Moon’s Dark Side</p><button className="primary-play" onClick={enter} disabled={busy}><span>{state?'Continue':'Enter'}<small>{state?state.team:'Open your team’s case'}</small></span><span>→</span></button>{error&&!entry&&<p className="title-error" role="alert">{error}</p>}</div>
    <footer className="title-footer"><span>An interactive mystery</span><span className="build-stamp-inline">build {__BUILD__}</span></footer>
    {entry&&<div className="modal-backdrop" onClick={()=>setEntry(false)}><section className="entry-card" role="dialog" aria-modal="true" aria-label="Enter the arena" onClick={e=>e.stopPropagation()}><p className="eyebrow">Your table. Your case.</p><h2>Enter the arena</h2>{codeLogin?<><p>Use the team code supplied by your invigilator.</p><form onSubmit={e=>{e.preventDefault();armAudio();onDevLogin(code);}}><label htmlFor="team-code">Team code</label><input id="team-code" autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} placeholder="Enter assigned code" required maxLength={48}/><button className="btn brass" disabled={busy||!code.trim()}>{busy?'Opening your case…':'Begin →'}</button></form></>:googleLogin?<><p>Sign in to open your case file.</p><a className="btn brass google-login" href="/api/auth/google">Continue with Google</a></>:<p className="title-error" role="alert">Sign-in is not configured on this deployment yet.</p>}{error&&<p className="title-error" role="alert">{error}</p>}{!config?.eventMode&&<button className="quiet-button" onClick={onGuest} disabled={busy}>Preview without a team code</button>}<button className="quiet-button" onClick={()=>setEntry(false)}>Back</button></section></div>}
  </main>;
}

export function ChapterSelect({ acts, onSelect, onClose, busy, practice, onCampaign }) {
  const panelRef=useRef(null);
  useCaseDialog(panelRef,onClose);
  return <div className="case-overlay" onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="case-panel chapter-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Chapter selection">
      <header className="case-panel-head">
        <div><p className="case-eyebrow">Your case, your pace</p><h2>Choose a chapter</h2><p className="case-header-note">Each chapter starts a separate practice save with the earlier evidence already collected. Your campaign save stays intact.</p></div>
        <button className="case-close" onClick={onClose} aria-label="Close chapter selection">×</button>
      </header>
      <div className="case-reading-scroll">
        <div className="chapter-grid">{acts.map((act, i) => <button key={act.id} className="chapter-tile" onClick={() => onSelect(act.id)} disabled={busy}><span className="chapter-number">{String(i).padStart(2, '0')}</span><span><small>{act.type === 'cinematic' ? 'Opening cinematic' : `${act.rooms?.length ?? 1} locations`}</small><strong>{act.title}</strong></span><span>↗</span></button>)}</div>
      </div>
      <footer className="case-panel-foot">
        <p>{practice ? 'Practice save active' : 'Campaign save active'}</p>
        <div className="case-footer-actions">
          {practice && <button className="case-button" onClick={onCampaign} disabled={busy}>Return to campaign save</button>}
          <button className="case-button primary" onClick={onClose}>Back to the case →</button>
        </div>
      </footer>
    </section>
  </div>;
}

export function EvidenceCard({ clue, onClose }) {
  const panelRef=useRef(null);
  useCaseDialog(panelRef,onClose);
  if (!clue) return null;
  return <div className="case-overlay" onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="case-panel evidence-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={clue.name}>
      <header className="case-panel-head">
        <div><p className="case-eyebrow">Exhibit logged · saved to notebook</p><h2>{clue.name}</h2></div>
        <button className="case-close" onClick={onClose} aria-label="Close evidence">×</button>
      </header>
      <div className="case-reading-scroll">
        <p className="case-reading-text">{clue.description}</p>
        {clue.page && <figure className="case-image"><img src={clue.page} alt={clue.name} /></figure>}
      </div>
      <footer className="case-panel-foot"><p>Filed in the case notebook</p><button className="case-button primary" onClick={onClose}>Return to the room →</button></footer>
    </section>
  </div>;
}
