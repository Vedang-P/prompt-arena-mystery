import { useEffect, useState } from 'react';
const formatTime = (seconds) => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export default function Leaderboard({ team, onClose }) {
  const [data,setData]=useState(null),[error,setError]=useState(false),[now,setNow]=useState(Date.now());
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
  return <div className="modal-backdrop" onClick={onClose}><section className="leaderboard-card" role="dialog" aria-modal="true" aria-label="Live leaderboard" onClick={e=>e.stopPropagation()}>
    <header><div><p className="eyebrow">Prompt Arena · Live</p><h2>Leaderboard</h2></div><button className="quiet-button" onClick={onClose}>Close ×</button></header>
    <p className="leaderboard-note">Current act and time since Act 1 began. Updates every 10 seconds.</p>
    {error&&<p role="status">Connection interrupted. Showing the last update; reconnecting…</p>}
    {!data&&!error&&<p role="status">Loading teams…</p>}
    {data&&<div className="leaderboard-scroll"><table><thead><tr><th>Rank</th><th>Team</th><th>Latest act</th><th>Time</th></tr></thead><tbody>{data.teams.map((t,i)=>{
      const elapsed=t.elapsedSeconds+(!t.solved&&t.act!=='act0'?Math.max(0,(now-data.received)/1000):0);
      return <tr key={t.name} className={t.name===team?'your-team':''}><td>{i+1}</td><th scope="row">{t.name}{t.name===team&&<small>You</small>}</th><td>{t.solved?'Case complete':t.act==='act0'?'Prologue':`${t.actTitle??t.act}`}</td><td className="timer">{t.act==='act0'?'Not started':formatTime(elapsed)}</td></tr>;
    })}</tbody></table>{data.teams.length===0&&<p>No teams have entered yet.</p>}</div>}
  </section></div>;
}
