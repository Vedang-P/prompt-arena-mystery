import { lazy, Suspense, useRef, useState } from 'react';
const Cinema=lazy(()=>import('./Cinema3D.jsx'));
import { useCaseDialog } from './InvestigationUI.jsx';
import LogoutButton from './LogoutButton.jsx';
const TITLE_CAST=[{character:'sameer',at:[-.54,.99],pose:'sit'},{character:'parth',at:[.54,.99],pose:'sit'}];
export default function TitleScreen({config,state,busy,error,onGuest,onResume,onRestart,onDevLogin,onSettings,onLeaderboard}) {
  const [entry,setEntry]=useState(false),[username,setUsername]=useState(''),[devOpen,setDevOpen]=useState(false),[devCode,setDevCode]=useState('');
  const over=Boolean(state?.ending||state?.solved);
  const enter=()=>{if(over){onRestart?.();return;}if(state)onResume();else setEntry(true);};
  const googleLogin=!!config?.google;
  return <main className="title-screen arena-title">
    <Suspense fallback={<div className="title-world" aria-hidden="true"/>}><div className="title-world"><Cinema sceneId="gazebo" shot="two" cast={TITLE_CAST}/></div></Suspense><div className="title-shade"/>
    <header className="title-header"><span className="brand">◒ Prompt Arena</span><div className="arena-account-actions"><button className="quiet-button" onClick={onLeaderboard}>Live leaderboard ↗</button><button className="quiet-button" onClick={onSettings}>Audio & settings</button>{state && <LogoutButton disabled={busy}/>}</div></header>
    <div className="title-content"><p className="eyebrow">A disappearance. A voice. A trail of secrets.</p><h1>Prompt<br/>Arena<span className="title-period">.</span></h1><p className="title-description">The Moon’s Dark Side</p><button className="primary-play" onClick={enter} disabled={busy}><span>{over?'Play again':state?'Continue':'Enter'}<small>{over?'The case has ended':state?state.team:'Open your case file'}</small></span><span>→</span></button>{error&&!entry&&<p className="title-error" role="alert">{error}</p>}</div>
    <footer className="title-footer"><span>An interactive mystery</span><span className="build-stamp-inline">build {__BUILD__}</span></footer>
    {entry&&<div className="modal-backdrop" onClick={()=>setEntry(false)}><section className="entry-card" role="dialog" aria-modal="true" aria-label="Enter the arena" onClick={e=>e.stopPropagation()}><p className="eyebrow">Your table. Your case.</p><h2>How would you like to play?</h2>
      {googleLogin&&<><a className="btn brass google-login" href="/api/auth/google">Continue with Google</a><p className="entry-or"><span>or play as a guest</span></p></>}
      <form onSubmit={e=>{e.preventDefault();onGuest(username);}}>
        <label htmlFor="guest-name">Detective name</label>
        <input id="guest-name" autoFocus autoComplete="nickname" autoCapitalize="words" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} placeholder="Choose a case name" maxLength={40}/>
        <button className="btn brass" disabled={busy}>{busy?'Opening your case…':googleLogin?'Play as guest →':'Enter the arena →'}</button>
      </form>
      {error&&<p className="title-error" role="alert">{error}</p>}
      {config?.devLogin&&(devOpen?<form onSubmit={e=>{e.preventDefault();onDevLogin(devCode);}}><label htmlFor="dev-code">Developer sign-in</label><input id="dev-code" type="password" value={devCode} onChange={e=>setDevCode(e.target.value)} placeholder="DEV_TEAM_CODE" autoCapitalize="off" autoComplete="off" required/><button className="btn ghost" disabled={busy||!devCode.trim()}>Enter sandbox</button></form>:<button className="quiet-button" onClick={()=>setDevOpen(true)}>Developer sign-in</button>)}
      <button className="quiet-button" onClick={()=>setEntry(false)}>Back</button></section></div>}
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
