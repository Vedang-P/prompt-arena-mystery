import { useEffect, useRef, useState } from 'react';
import { useSettings } from './Settings.jsx';
import {ambienceFor,musicFor} from './MusicCues.js';
export default function Soundtrack({ roomId='gazebo',enabledOverride }) {
  const { sound } = useSettings();
  const enabled=enabledOverride??sound;
  const [cue,setCue] = useState(()=>musicFor(roomId));
  const [ambience,setAmbience] = useState(()=>ambienceFor(roomId));
  const tracks = useRef([]), ducked=useRef(false), paused=useRef(false);
  useEffect(() => { setCue(musicFor(roomId));setAmbience(ambienceFor(roomId)); },[roomId]);
  useEffect(() => {
    const cinematic=e=>{setCue(e.detail.cue);if(e.detail.ambience!==undefined)setAmbience(e.detail.ambience);paused.current=e.detail.paused;};
    const speech=e=>{ducked.current=e.detail.active;};
    window.addEventListener('arena-cue',cinematic); window.addEventListener('arena-speech',speech);
    return()=>{window.removeEventListener('arena-cue',cinematic);window.removeEventListener('arena-speech',speech);};
  },[]);
  useEffect(() => {
    if(!enabled){tracks.current.forEach(t=>t.audio.pause());tracks.current=[];return;}
    const audio=new Audio(`/assets/audio/${cue}.mp3`);audio.loop=true;audio.volume=0;
    const track={audio,target:true,gain:.18,kind:'music'};tracks.current.forEach(t=>{if(t.kind==='music')t.target=false;});tracks.current.push(track);
    audio.onerror=()=>{track.target=false;};
    const play=()=>{if(!paused.current&&!audio.error)audio.play().catch(()=>{});};play();window.addEventListener('pointerdown',play);
    return()=>{window.removeEventListener('pointerdown',play);track.target=false;};
  },[enabled,cue]);
  useEffect(() => {
    tracks.current.forEach(t=>{if(t.kind==='ambience')t.target=false;});
    if(!enabled||!ambience?.length)return;
    const active=ambience.map(({file,gain})=>{
      const audio=new Audio(`/assets/audio/ambience/${file}`);audio.loop=true;audio.volume=0;
      const track={audio,target:true,gain,kind:'ambience'};tracks.current.push(track);
      audio.onerror=()=>{track.target=false;};
      return track;
    });
    const play=()=>{if(!paused.current)active.forEach(t=>{if(!t.audio.error)t.audio.play().catch(()=>{});});};
    play();window.addEventListener('pointerdown',play);
    return()=>{window.removeEventListener('pointerdown',play);active.forEach(t=>{t.target=false;});};
  },[enabled,ambience]);
  useEffect(() => {
    const interval=setInterval(()=>{
      tracks.current=tracks.current.filter(t=>{
        const target=t.target&&enabled&&!paused.current?(ducked.current?(t.kind==='music'?.065:t.gain*.55):(t.gain??.18)):0;
        t.audio.volume+=(target-t.audio.volume)*.12;
        if(paused.current)t.audio.pause();else if(t.target&&enabled&&t.audio.paused&&!t.audio.error)t.audio.play().catch(()=>{});
        if(!t.target&&t.audio.volume<.001){t.audio.pause();return false;}return true;
      });
    },70);
    return()=>{clearInterval(interval);tracks.current.forEach(t=>t.audio.pause());tracks.current=[];};
  },[enabled]);
  return null;
}
