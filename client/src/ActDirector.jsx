import { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import Cinema from './Cinema3D.jsx';
import { useSettings } from './Settings.jsx';
import {ambienceFor} from './MusicCues.js';
import LogoutButton from './LogoutButton.jsx';
const SPEAKERS={narrator:'Narrator',voice:'Unknown voice'};
export default function ActDirector({act,characters=[],onComplete,busy,nextActTitle,nextActKicker,onLeaderboard,review=false}) {
  const beats=act?.beats??[],names=useMemo(()=>Object.fromEntries(characters.map(c=>[c.id,c.name])),[characters]);
  const debug=import.meta.env.DEV?new URLSearchParams(location.search).get('beat'):null;
  const start=Math.max(0,beats.findIndex(b=>b.id===debug));
  const [phase,setPhase]=useState(debug||review?'play':'card'),[beatIndex,setBeatIndex]=useState(start),[lineIndex,setLineIndex]=useState(0);
  const [paused,setPaused]=useState(review),[readyRoom,setReadyRoom]=useState(null);
  const {sound,update}=useSettings();
  const pausedRef=useRef(paused),advanceRef=useRef(null),completeRef=useRef(onComplete),finishing=useRef(false);
  completeRef.current=onComplete;pausedRef.current=paused;
  const beat=beats[beatIndex],line=beat?.lines?.[lineIndex];
  const advance=()=>{
    if(phase==='card'){setPhase('play');return;}
    if(lineIndex<(beat?.lines.length??0)-1)setLineIndex(i=>i+1);
    else if(beatIndex<beats.length-1){setLineIndex(0);setBeatIndex(i=>i+1);}
    else setPhase('end');
  };advanceRef.current=advance;
  useEffect(()=>{
    ['sameer','parth','mother','officer'].forEach(c=>useGLTF.preload(`/assets/cast/${c}.glb`));
  },[]);
  useEffect(()=>{
    if(phase!=='card'||readyRoom!==beat?.room)return;
    const timer=setTimeout(()=>setPhase('play'),2400);return()=>clearTimeout(timer);
  },[phase,readyRoom,beat?.room]);
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:beatIndex<3?'dusk':beat?.room==='sameer_room'?'unknown':'search',ambience:ambienceFor(beat?.room),paused}}));
  },[beatIndex,beat?.room,paused]);
  // Hand the room's own cue back only when the cinematic goes away — running this on every
  // beat restarted the score each time a dependency changed.
  useEffect(()=>()=>window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:'dusk',ambience:ambienceFor(act.entry_room),paused:false}})),[]);
  useEffect(()=>{
    if(phase!=='play'||!line||readyRoom!==beat.room)return;
    // Subtitles hold for a reading-time estimate; pausing stops the clock.
    let elapsed=0,last=performance.now();
    const duration=Math.max(2.2,line.text.length*.06+.65);
    const timer=setInterval(()=>{
      const now=performance.now(),delta=Math.min((now-last)/1000,.3);last=now;
      if(pausedRef.current)return;
      elapsed+=delta;if(elapsed>=duration)advanceRef.current();
    },80);
    return()=>clearInterval(timer);
  },[phase,line,readyRoom,beat?.room]);
  useEffect(()=>{
    if(phase!=='end'||busy||finishing.current)return;
    const timer=setTimeout(()=>{finishing.current=true;completeRef.current?.();},2200);
    return()=>clearTimeout(timer);
  },[phase,busy]);
  useEffect(()=>{
    const key=e=>{if(phase==='play'&&e.code==='Space'&&!['BUTTON','INPUT'].includes(e.target.tagName)){e.preventDefault();setPaused(p=>!p);}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[phase]);
  if(!act)return null;
  const phone=beat?.overlay?.includes('voicenote');
  return <main className={`cinema prologue ${phase==='card'?'cinema-card-phase':''}`} data-scene-ready={readyRoom===beat.room}>
    <div className="cinema-stage"><Cinema actId={act.id} sceneId={beat.room} shot={beat.shot} cast={beat.cast??[]} speaker={phase==='play'?line?.speaker:null} paused={paused} onReady={()=>setReadyRoom(beat.room)}/><div className="cinema-bar top"/><div className="cinema-bar bottom"/></div>
    <header className="prologue-header"><span>Prompt Arena <i>/</i> Prologue</span><div className="arena-account-actions"><button className="quiet-button" onClick={()=>{setPaused(true);onLeaderboard?.();}}>Live leaderboard ↗</button><LogoutButton disabled={busy}/></div></header>
    {phase==='card'&&<div className="cinema-titlecard"><p className="cinema-act-kicker">Act 0 · Prologue</p><h1 className="cinema-act-title">The Vanishing</h1><p className="cinema-act-sub">Yesterday, he was right beside you.</p><small>{readyRoom!==beat.room?'Preparing the opening scene…':'The story is about to begin'}</small></div>}
    {phase==='play'&&line&&<>
      <aside className="scene-caption"><span>{beat.room==='gazebo'?(beatIndex<3?'Yesterday · 6:42 PM':'Today · 6:30 PM'):beat.room==='parth_home'?'Parth’s home · 7:15 PM':beat.room==='police_station'?'Police station · 9:08 PM':'Sameer’s room · 11:47 PM'}</span><small>{String(beatIndex+1).padStart(2,'0')} / {String(beats.length).padStart(2,'0')}</small></aside>
      <div className="cinema-footer"><div className={`cinema-subtitles ${phone?'voicenote-subtitles':''}`}><div className="subtitle-card" key={`${beat.id}-${lineIndex}`}><span className="cinema-speaker">{phone?'Voice message · Unknown sender':SPEAKERS[line.speaker]??names[line.speaker]??line.speaker}</span>{phone&&<div className={`message-wave ${paused?'paused':''}`} aria-hidden="true">{Array.from({length:25},(_,i)=><i key={i} style={{height:12+Math.abs(Math.sin(i*2.7))*23,animationDelay:`${i*35}ms`}}/>)}</div>}<p>{line.text}</p></div></div>
      <footer className="cinema-controls"><div className="cinema-progress" aria-label="Opening progress">{beats.map((b,i)=><span key={b.id} className={`seg ${i<beatIndex?'done':''} ${i===beatIndex?'active':''}`}/>)}</div><div className="cinema-buttons"><button className="btn ghost" onClick={()=>setPaused(p=>!p)}>{paused?'Resume':'Pause'}</button><button className="btn ghost" onClick={()=>update({sound:!sound})}>{sound?'Mute audio':'Enable audio'}</button><button className="btn ghost" onClick={()=>setPhase('end')}>Skip prologue →</button></div></footer></div>
      {paused&&<div className="pause-label">Paused <small>Space to resume</small></div>}
    </>}
    {phase==='end'&&<div className="cinema-endcard"><p className="cinema-act-kicker">The investigation begins</p><h1 className="cinema-act-title">{nextActKicker??'Act I'}</h1><p className="cinema-act-sub">{nextActTitle??'The Room'}</p><p className="cinema-act-hint">{busy?'Opening your case…':'Entering Act 1…'}</p><button className="btn brass" disabled={busy} onClick={()=>{finishing.current=true;onComplete?.();}}>Enter Act 1 →</button></div>}
  </main>;
}
