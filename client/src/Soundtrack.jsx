import { useEffect, useRef, useState } from 'react';
import { useSettings } from './Settings.jsx';
import {musicFor} from './MusicCues.js';
export default function Soundtrack({ roomId='gazebo' }) {
  const { sound } = useSettings();
  const [cue,setCue] = useState(musicFor(roomId));
  const tracks = useRef([]), ducked=useRef(false), paused=useRef(false);
  useEffect(() => { setCue(musicFor(roomId)); },[roomId]);
  useEffect(() => {
    const cinematic=e=>{setCue(e.detail.cue); paused.current=e.detail.paused;};
    const speech=e=>{ducked.current=e.detail.active;};
    window.addEventListener('arena-cue',cinematic); window.addEventListener('arena-speech',speech);
    return()=>{window.removeEventListener('arena-cue',cinematic);window.removeEventListener('arena-speech',speech);};
  },[]);
  useEffect(() => {
    if(!sound){tracks.current.forEach(t=>t.audio.pause());tracks.current=[];return;}
    const audio=new Audio(`/assets/audio/${cue}.mp3`);audio.loop=true;audio.volume=0;
    const track={audio,target:true};tracks.current.forEach(t=>t.target=false);tracks.current.push(track);
    const play=()=>{if(!paused.current)audio.play().catch(()=>{});};play();window.addEventListener('pointerdown',play);
    return()=>{window.removeEventListener('pointerdown',play);track.target=false;};
  },[sound,cue]);
  useEffect(() => {
    const interval=setInterval(()=>{
      tracks.current=tracks.current.filter(t=>{
        const target=t.target&&sound&&!paused.current?(ducked.current?.065:.18):0;
        t.audio.volume+=(target-t.audio.volume)*.12;
        if(paused.current)t.audio.pause();else if(t.target&&sound&&t.audio.paused)t.audio.play().catch(()=>{});
        if(!t.target&&t.audio.volume<.001){t.audio.pause();return false;}return true;
      });
    },70);
    return()=>{clearInterval(interval);tracks.current.forEach(t=>t.audio.pause());tracks.current=[];};
  },[sound]);
  return null;
}
