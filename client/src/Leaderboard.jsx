import { useEffect, useRef, useState } from 'react';
import { useCaseDialog } from './InvestigationUI.jsx';
const formatTime = (seconds) => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export default function Leaderboard({ team, onClose }) {
  const [data,setData]=useState(null),[error,setError]=useState(false),[now,setNow]=useState(Date.now());
  const panelRef=useRef(null);
  useCaseDialog(panelRef,onClose);
  useEffect(()=>{
    const controller=new AbortController(); let alive=true;
    const refresh=async()=>{
      if(document.hidden)return;
      try{const r=await fetch('/api/leaderboard',{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const j=await r.json();if(alive){setData({...j,received:Date.now()});setError(false);}}
      catch(e){if(alive&&e.name!=='AbortError')setError(true);}
    };
    refresh();const poll=setInterval(refresh,10000),tick=setInterval(()=>setNow(Date.now()),1000);
    return()=>{alive=false;controller.abort();clearInterval(poll);clearInterval(tick);};
  },[]);
  return <div className="case-overlay" onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="case-panel leaderboard-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Live leaderboard">
      <header className="case-panel-head">
        <div><p className="case-eyebrow">Prompt Arena · Live</p><h2>Leaderboard</h2><p className="case-header-note">Current act and time since Act 1 began. Updates every 10 seconds.</p></div>
        <button className="case-close" onClick={onClose} aria-label="Close leaderboard">×</button>
      </header>
      {(error||!data)&&<p className="case-note" role="status">{error?'Connection interrupted. Showing the last update; reconnecting…':'Loading teams…'}</p>}
      {data&&<div className="leaderboard-scroll"><table><thead><tr><th>Rank</th><th>Team</th><th>Latest act</th><th>Clues</th><th>Puzzles</th><th>Penalties</th><th>Time</th></tr></thead><tbody>{data.teams.map((t,i)=>{
        const elapsed=t.elapsedSeconds+(!t.solved&&t.act!=='act0'?Math.max(0,(now-data.received)/1000):0);
        return <tr key={t.name} className={t.name===team?'your-team':''}><td>{i+1}</td><th scope="row">{t.name}{t.name===team&&<small>You</small>}</th><td>{t.solved?'Case complete':t.act==='act0'?'Prologue':`${t.actTitle??t.act}`}</td><td className="count">{t.clues_found??0}</td><td className="count">{t.puzzles_solved??0}</td><td className="count">{t.penalties??0}</td><td className="timer">{t.act==='act0'?'Not started':formatTime(elapsed)}</td></tr>;
      })}</tbody></table>{data.teams.length===0&&<p className="case-muted">No teams have entered yet.</p>}</div>}
      <footer className="case-panel-foot">
        <p>{data?`${data.teams.length} team${data.teams.length===1?'':'s'} in play`:'—'}</p>
        <button className="case-button primary" onClick={onClose}>Back to the case →</button>
      </footer>
    </section>
  </div>;
}
