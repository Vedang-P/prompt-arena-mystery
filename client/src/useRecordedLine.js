import {useEffect,useRef,useState} from 'react';
import {getVoiceTrack,releaseSpeech} from './RecordedSpeech.js';
import {publishSpeech} from './VoicePlayback.js';

// The recording is the clock: subtitle advance waits for ended, never a text
// estimate. Pause retains its exact position; a failed download uses subtitles.
export function useRecordedLine({line,enabled,paused,ready=true,onEnd}) {
  const [status,setStatus]=useState('loading');
  const active=useRef(null),pausedRef=useRef(paused),endRef=useRef(onEnd);
  pausedRef.current=paused;endRef.current=onEnd;
  useEffect(()=>{
    if(!line||!ready)return;
    let disposed=false,elapsed=0,last=performance.now(),timer;
    const state={audio:null,done:false,failed:false,play:null};active.current=state;setStatus('loading');
    getVoiceTrack(line.speaker,line.text).catch(()=>null).then(track=>{
      if(disposed)return;
      const audio=enabled&&track?new Audio(track.url):null;state.audio=audio;
      const duration=Math.max(2.5,track?.duration??line.text.length*.06);
      const play=()=>audio?.play().then(()=>{if(!disposed)setStatus('playing');}).catch(error=>{if(!disposed){state.failed=error.name!=='NotAllowedError';setStatus(state.failed?'unavailable':'blocked');}});state.play=play;
      if(audio){audio.volume=.95;audio.preload='auto';audio.onerror=()=>{if(!disposed){state.failed=true;setStatus('unavailable');releaseSpeech(audio);}};publishSpeech(line.speaker,audio,track.envelope);if(!pausedRef.current)play();}
      else setStatus(enabled?'unavailable':'silent');
      last=performance.now();
      timer=setInterval(()=>{
        const now=performance.now(),delta=Math.min((now-last)/1000,.3);last=now;
        if(pausedRef.current||state.done)return;
        if(audio&&!state.failed&&!audio.error){if(!audio.ended)return;elapsed+=delta;}else elapsed+=delta;
        if(elapsed >= (audio && !state.failed && !audio.error ? .65 : duration)){
          state.done=true;releaseSpeech(audio);setStatus('ended');endRef.current?.();
        }
      },80);
    });
    const retry=()=>{if(!pausedRef.current&&state.audio?.paused&&!state.audio.ended)state.play?.();};
    window.addEventListener('pointerdown',retry);
    return()=>{disposed=true;clearInterval(timer);window.removeEventListener('pointerdown',retry);releaseSpeech(state.audio);if(active.current===state)active.current=null;};
  },[line,enabled,ready]);
  useEffect(()=>{
    const state=active.current;if(!state?.audio)return;
    if(paused)state.audio.pause();else if(!state.done)state.play?.();
  },[paused]);
  return {status,retry:()=>active.current?.play?.()};
}
