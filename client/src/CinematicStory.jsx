import { useEffect, useMemo, useRef, useState } from 'react';
import Cinema from './Cinema3D.jsx';
import LogoutButton from './LogoutButton.jsx';
import {locationFor,storyCast,cinematicPhaseFor} from './SceneStaging.js';
import {ambienceFor,musicFor} from './MusicCues.js';

export default function CinematicStory({ story, act, characters, onDone, busy, initialIndex=0, initiallyPaused=false }) {
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(initiallyPaused);
  const [readyRoom,setReadyRoom]=useState(null);
  const line = story.lines[index];
  const last = index >= story.lines.length - 1;
  const names = Object.fromEntries(characters.map((c) => [c.id, c.name]));
  const sceneId = locationFor(act, story.after, index);
  const cinematicPhase=cinematicPhaseFor(act,story.after,sceneId,index);
  const sceneReadyKey=`${sceneId}:${cinematicPhase??'default'}`;
  const cast = useMemo(()=>storyCast(act,story.after,sceneId,index),[act.id,index,sceneId,story.after]);
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:musicFor(sceneId),ambience:ambienceFor(sceneId),paused}}));
  },[sceneId,paused]);
  // Restore the act's room cue on unmount only, so changing scene or pausing does not
  // restart the score from the top.
  useEffect(()=>()=>window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:musicFor(act.entry_room),ambience:ambienceFor(act.entry_room),paused:false}})),[]);
  const pausedRef=useRef(paused);pausedRef.current=paused;
  // Subtitles hold for a reading-time estimate, then move on; pausing stops the
  // clock and the final line waits for the player.
  useEffect(()=>{
    if(!line||last||readyRoom!==sceneReadyKey)return;
    let elapsed=0,before=performance.now();
    const duration=Math.max(2.5,line.text.length*.06);
    const timer=setInterval(()=>{
      const now=performance.now(),delta=Math.min((now-before)/1000,.3);before=now;
      if(pausedRef.current)return;
      elapsed+=delta;if(elapsed>=duration){clearInterval(timer);setIndex(i=>i+1);}
    },80);
    return()=>clearInterval(timer);
  },[line,last,readyRoom,sceneReadyKey]);
  const advance = () => { if (busy) return; if (!last) setIndex((i) => i + 1); else onDone(); };
  useEffect(() => {
    const key = (e) => { if (!['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(e.target.tagName) && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); advance(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className="story-overlay cinematic-story" role="dialog" aria-modal="true" aria-label={`${act.title} cinematic`} data-scene-ready={readyRoom===sceneReadyKey}>
    <div className="story-world"><Cinema actId={act.id} sceneId={sceneId} cinematicPhase={cinematicPhase} cast={cast} shot={index % 3 === 0 ? 'wide' : line?.speaker === 'narrator' ? 'two' : 'portrait'} speaker={line?.speaker} paused={paused} onReady={()=>setReadyRoom(sceneReadyKey)} ending={act.id === 'act8' && story.after === 'outro'} /></div>
    <div className="cinema-bar top" /><div className="cinema-bar bottom" />
    <header className="story-scene-title"><div><span className="eyebrow">{act.kicker} · {story.after === 'intro' ? 'Opening' : 'Closing'}</span><h2>{act.title}</h2></div><LogoutButton disabled={busy}/></header>
    <div className="cinema-footer"><div className="cinematic-caption" key={index}><span className="eyebrow">{names[line?.speaker] ?? (line?.speaker === 'voice' ? 'Unknown voice' : 'Sameer’s story')}</span><p>{line?.text}</p></div>
    <div className="cinematic-tools"><span>{String(index + 1).padStart(2, '0')} / {String(story.lines.length).padStart(2, '0')}</span><button className="btn ghost" onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button><button className="btn ghost" onClick={onDone} disabled={busy}>Skip cinematic</button><button className="btn brass" onClick={advance} disabled={busy}>{busy ? 'Saving…' : last ? story.doneLabel : 'Continue'}</button></div></div>
  </div>;
}
