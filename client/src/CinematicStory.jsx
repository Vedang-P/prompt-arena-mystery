import { useEffect, useMemo, useState } from 'react';
import Cinema from './Cinema.jsx';
import { useSettings } from './Settings.jsx';
import LogoutButton from './LogoutButton.jsx';
import {locationFor,storyCast} from './SceneStaging.js';
import {useRecordedLine} from './useRecordedLine.js';
import {musicFor} from './MusicCues.js';

export default function CinematicStory({ story, act, characters, onDone, busy, initialIndex=0, initiallyPaused=false }) {
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(initiallyPaused);
  const [readyRoom,setReadyRoom]=useState(null);
  const { narration,update } = useSettings();
  const line = story.lines[index];
  const last = index >= story.lines.length - 1;
  const names = Object.fromEntries(characters.map((c) => [c.id, c.name]));
  const sceneId = locationFor(act, story.after, index);
  const cast = useMemo(()=>storyCast(act,story.after,sceneId),[act.id,sceneId,story.after]);
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:musicFor(sceneId),paused}}));
    return()=>window.dispatchEvent(new CustomEvent('arena-cue',{detail:{cue:musicFor(act.entry_room),paused:false}}));
  },[sceneId,paused,act.entry_room]);
  const voice=useRecordedLine({line,enabled:narration,paused,ready:readyRoom===sceneId,onEnd:()=>{if(!last)setIndex(i=>i+1);}});
  const advance = () => { if (busy) return; if (!last) setIndex((i) => i + 1); else onDone(); };
  useEffect(() => {
    const key = (e) => { if (!['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(e.target.tagName) && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); advance(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className="story-overlay cinematic-story" role="dialog" aria-modal="true" aria-label={`${act.title} cinematic`} data-scene-ready={readyRoom===sceneId} data-voice-status={voice.status}>
    <div className="story-world"><Cinema sceneId={sceneId} cast={cast} shot={index % 3 === 0 ? 'wide' : line?.speaker === 'narrator' ? 'two' : 'portrait'} speaker={line?.speaker} paused={paused} onReady={()=>setReadyRoom(sceneId)} ending={act.id === 'act8' && story.after === 'outro'} /></div>
    <div className="cinema-bar top" /><div className="cinema-bar bottom" />
    <header className="story-scene-title"><div><span className="eyebrow">{act.kicker} · {story.after === 'intro' ? 'Opening' : 'Closing'}</span><h2>{act.title}</h2></div><LogoutButton disabled={busy}/></header>
    <div className="cinema-footer"><div className="cinematic-caption" key={index}><span className="eyebrow">{names[line?.speaker] ?? (line?.speaker === 'voice' ? 'Unknown voice' : 'Sameer’s story')}</span><p>{line?.text}</p></div>
    {voice.status==='blocked'&&!paused&&<button className="audio-unlock" onClick={voice.retry}>Play voice audio</button>}
    <div className="cinematic-tools"><span>{String(index + 1).padStart(2, '0')} / {String(story.lines.length).padStart(2, '0')}</span><button className="btn ghost" onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button><button className="btn ghost" onClick={()=>update({narration:!narration})}>{narration?'Mute voices':'Enable voices'}</button><button className="btn ghost" onClick={onDone} disabled={busy}>Skip cinematic</button><button className="btn brass" onClick={advance} disabled={busy}>{busy ? 'Saving…' : last ? story.doneLabel : 'Continue'}</button></div></div>
  </div>;
}
