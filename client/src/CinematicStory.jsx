import { useEffect, useMemo, useState } from 'react';
import Cinema from './Cinema.jsx';
import { useSettings } from './Settings.jsx';

function locationFor(act, kind, index) {
  const scenes = {
    act1: { intro: ['parth_home', 'parth_home', 'parth_home', 'parth_home', 'parth_room'], outro: ['parth_room'] },
    act2: { intro: ['gazebo', 'gazebo', 'sameer_room'], outro: ['sameer_room'] },
    act3: { intro: ['concert'], outro: ['workshop', 'workshop', 'sameer_room'] },
    act4: { intro: ['sameer_room', 'hospital'], outro: ['hospital'] },
    act5: { intro: ['hospital', 'hospital', 'tanush_office'], outro: ['sameer_room'] },
    act6: { intro: ['sameer_room'], outro: ['police_station', 'sameer_room'] },
    act7: { intro: ['sameer_room'], outro: ['sameer_room', 'sameer_room', 'hospital'] },
    act8: { intro: ['hospital'], outro: ['hospital'] },
  }[act.id]?.[kind];
  return scenes?.[Math.min(index, scenes.length - 1)] ?? act.entry_room;
}
export default function CinematicStory({ story, act, characters, onDone, busy }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { narration } = useSettings();
  const line = story.lines[index];
  const last = index >= story.lines.length - 1;
  const names = Object.fromEntries(characters.map((c) => [c.id, c.name]));
  const sceneId = locationFor(act, story.after, index);
  const cast = useMemo(() => {
    const companion = sceneId === 'parth_home' ? 'mother' : sceneId === 'police_station' ? 'officer' : sceneId === 'tanush_office' ? 'tanush' : act.id === 'act8' ? 'leader' : act.id === 'act7' && story.after === 'intro' || sceneId === 'concert' ? 'veer' : null;
    return ['sameer', ...(companion ? [companion] : [])].map((character, i) => ({ character, at: [(i - 0.5) * 1.6, 0], rot: i ? -0.15 : 0.15 }));
  }, [act.id, sceneId, story.after]);
  useEffect(() => {
    if (!line || paused || last) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), Math.max(5200, line.text.length * 62));
    return () => clearTimeout(timer);
  }, [line, paused, last]);
  useEffect(() => {
    if (!narration || paused || !line || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(line.text); utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [line, narration, paused]);
  const advance = () => { if (busy) return; if (!last) setIndex((i) => i + 1); else onDone(); };
  useEffect(() => {
    const key = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); advance(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className="story-overlay cinematic-story" role="dialog" aria-modal="true" aria-label={`${act.title} cinematic`}>
    <div className="story-world"><Cinema sceneId={sceneId} cast={cast} shot={index % 3 === 0 ? 'wide' : line?.speaker === 'narrator' ? 'two' : 'portrait'} speaker={line?.speaker} ending={act.id === 'act8' && story.after === 'outro'} /></div>
    <div className="cinema-bar top" /><div className="cinema-bar bottom" />
    <header className="story-scene-title"><span className="eyebrow">{act.kicker} · {story.after === 'intro' ? 'Opening' : 'Closing'}</span><h2>{act.title}</h2></header>
    <div className="cinematic-caption" key={index}><span className="eyebrow">{names[line?.speaker] ?? (line?.speaker === 'voice' ? 'Unknown voice' : 'Sameer’s story')}</span><p>{line?.text}</p></div>
    <div className="cinematic-tools"><span>{String(index + 1).padStart(2, '0')} / {String(story.lines.length).padStart(2, '0')}</span><button className="btn ghost" onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button><button className="btn ghost" onClick={onDone} disabled={busy}>Skip cinematic</button><button className="btn brass" onClick={advance} disabled={busy}>{busy ? 'Saving…' : last ? story.doneLabel : 'Continue'}</button></div>
  </div>;
}
