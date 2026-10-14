import { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import Cinema from './Cinema3D.jsx';
import {ambienceFor} from './MusicCues.js';
import LogoutButton from './LogoutButton.jsx';
const SPEAKERS={narrator:'Narrator',voice:'Unknown voice'};
export default function ActDirector({act,characters=[],onComplete,busy,nextActTitle,nextActKicker,review=false}) {
  const beats=act?.beats??[],names=useMemo(()=>Object.fromEntries(characters.map(c=>[c.id,c.name])),[characters]);
  const debug=import.meta.env.DEV?new URLSearchParams(location.search).get('beat'):null;
  const start=Math.max(0,beats.findIndex(b=>b.id===debug));
  const [phase,setPhase]=useState(debug||review?'play':'card'),[beatIndex,setBeatIndex]=useState(start),[lineIndex,setLineIndex]=useState(0);
  const [paused,setPaused]=useState(review),[readyRoom,setReadyRoom]=useState(null),[sceneFailed,setSceneFailed]=useState(false);
  const advanceRef=useRef(null),finishing=useRef(false),advanceLock=useRef(0);
  const beat=beats[beatIndex],line=beat?.lines?.[lineIndex];
  // The prologue's park beats run across two evenings: everything before the
  // "next day" beat is yesterday, the rest is today.
  const todayStart=beats.findIndex(b=>b.id==='gazebo_nextday');
  const yesterday=beat?.room==='gazebo'&&(todayStart===-1||beatIndex<todayStart);
  const advance=()=>{
    if(phase==='card'){setPhase('play');return;}
    // One click (or key press) advances exactly one line; a held Space/Enter or
    // a double-click must never run the whole segment down.
    const now=performance.now();
    if(now-advanceLock.current<450)return;
    advanceLock.current=now;
    if(lineIndex<(beat?.lines.length??0)-1)setLineIndex(i=>i+1);
    else if(beatIndex<beats.length-1){setLineIndex(0);setBeatIndex(i=>i+1);}
    else setPhase('end');
  };advanceRef.current=advance;
  useEffect(()=>{
    ['sameer','parth','mother','officer'].forEach(c=>useGLTF.preload(`/assets/cast/${c}.glb`));
  },[]);
  useEffect(()=>{
    if(phase!=='card')return;
    // A scene still bringing up its 3D context must never hold the prologue
    // hostage: the subtitles roll now and the stage relights the moment the
    // renderer is ready, with no downgrade in between.
    if(sceneFailed){const t=setTimeout(()=>{setReadyRoom(beat?.room);setPhase('play');},600);return()=>clearTimeout(t);}
    if(readyRoom!==beat?.room)return;
    const timer=setTimeout(()=>setPhase('play'),2400);return()=>clearTimeout(timer);
  },[phase,readyRoom,beat?.room,sceneFailed]);
  // Hard watchdog: if the scene never reports ready (stuck asset, context still
  // retrying), roll the opening anyway instead of waiting forever.
  useEffect(()=>{
    if(phase!=='card'||readyRoom===beat?.room)return;
    const timer=setTimeout(()=>{setSceneFailed(true);setReadyRoom(beat?.room);},12000);
    return()=>clearTimeout(timer);
  },[phase,readyRoom,beat?.room]);
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:yesterday?'dusk':beat?.room==='sameer_room'?'unknown':'search',ambience:ambienceFor(beat?.room),paused}}));
  },[beatIndex,beat?.room,paused]);
  // Hand the room's own cue back only when the cinematic goes away — running this on every
  // beat restarted the score each time a dependency changed.
  useEffect(()=>()=>window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:'dusk',ambience:ambienceFor(act.entry_room),paused:false}})),[]);
  // The prologue never advances on a timer: every line waits for Next (or
  // Space/Enter), and the end card waits for Enter Act 1.
  useEffect(()=>{
    const key=e=>{if(phase==='play'&&(e.code==='Space'||e.code==='Enter')&&!['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(e.target.tagName)){e.preventDefault();advanceRef.current();}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[phase]);
  if(!act)return null;
  const phone=beat?.overlay?.includes('voicenote');
  return <main className={`cinema prologue ${phase==='card'?'cinema-card-phase':''}`} data-scene-ready={readyRoom===beat.room}>
    <div className="cinema-stage"><Cinema actId={act.id} sceneId={beat.room} shot={beat.shot} cast={beat.cast??[]} speaker={phase==='play'?line?.speaker:null} paused={paused} onReady={()=>setReadyRoom(beat.room)} onFail={()=>setSceneFailed(true)}/><div className="cinema-bar top"/><div className="cinema-bar bottom"/></div>
    <header className="prologue-header"><span>Prompt Arena <i>/</i> Prologue</span><div className="arena-account-actions"><LogoutButton disabled={busy}/></div></header>
    {phase==='card'&&<div className="cinema-titlecard"><p className="cinema-act-kicker">Act 0 · Prologue</p><h1 className="cinema-act-title">The Vanishing</h1><p className="cinema-act-sub">Yesterday, he was right beside you.</p><small>{sceneFailed?'The 3D stage is still coming up — the story begins now…':readyRoom!==beat.room?'Preparing the opening scene…':'The story is about to begin'}</small></div>}
    {phase==='play'&&line&&<>
      <aside className="scene-caption"><span>{beat.caption ?? (beat.room==='parth_home'?'Parth’s home · 7:15 PM':beat.room==='police_station'?'Police station · 9:08 PM':beat.room==='sameer_room'?'Sameer’s room · 11:47 PM':'The park gazebo')}</span><small>{String(beatIndex+1).padStart(2,'0')} / {String(beats.length).padStart(2,'0')}</small></aside>
      <div className="cinema-footer"><div className={`cinema-subtitles ${phone?'voicenote-subtitles':''}`}><div className="subtitle-card" key={`${beat.id}-${lineIndex}`}><span className="cinema-speaker">{phone?'Voice message · Unknown sender':SPEAKERS[line.speaker]??names[line.speaker]??line.speaker}</span>{phone&&<div className={`message-wave ${paused?'paused':''}`} aria-hidden="true">{Array.from({length:25},(_,i)=><i key={i} style={{height:12+Math.abs(Math.sin(i*2.7))*23,animationDelay:`${i*35}ms`}}/>)}</div>}<p>{line.text}</p></div></div>
      <footer className="cinema-controls"><div className="cinema-progress" aria-label="Opening progress">{beats.map((b,i)=><span key={b.id} className={`seg ${i<beatIndex?'done':''} ${i===beatIndex?'active':''}`}/>)}</div><div className="cinema-buttons"><button className="btn ghost" onClick={()=>setPaused(p=>!p)}>{paused?'Resume':'Pause'}</button><button className="btn ghost" onClick={()=>setPhase('end')}>Skip prologue →</button><button className="btn brass" onClick={advance}>Next →</button></div></footer></div>
      {paused&&<div className="pause-label">Paused <small>Resume to keep reading</small></div>}
    </>}
    {phase==='end'&&<div className="cinema-endcard"><p className="cinema-act-kicker">The investigation begins</p><h1 className="cinema-act-title">{nextActKicker??'Act I'}</h1><p className="cinema-act-sub">{nextActTitle??'The Room'}</p><p className="cinema-act-hint">{busy?'Opening your case…':'Enter Act 1 when you are ready.'}</p><button className="btn brass" disabled={busy} onClick={()=>{finishing.current=true;onComplete?.();}}>Enter Act 1 →</button></div>}
  </main>;
}
