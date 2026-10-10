import {getVoiceTrack,releaseSpeech} from './RecordedSpeech.js';
import {publishSpeech} from './VoicePlayback.js';
let cancelCurrent=()=>{};
export function stopCharacterSpeech(){cancelCurrent();cancelCurrent=()=>{};}
export function speakCharacter(character,text,onError=()=>{}) {
  stopCharacterSpeech();
  let disposed=false,audio;
  const stop=()=>{disposed=true;releaseSpeech(audio);};cancelCurrent=stop;
  getVoiceTrack(character,text).then(track=>{
    if(disposed)return;
    if(!track){onError('This reply has subtitles only.');return;}
    audio=new Audio(track.url);audio.volume=.95;publishSpeech(character,audio,track.envelope);
    audio.onended=()=>releaseSpeech(audio);
    audio.onerror=()=>{releaseSpeech(audio);if(!disposed)onError('Voice audio could not load. Use Replay reply to try again.');};
    audio.play().catch(()=>{releaseSpeech(audio);if(!disposed)onError('Use Replay reply to play the voice audio.');});
  }).catch(()=>{if(!disposed)onError('Voice audio could not load. Use Replay reply to try again.');});
  return stop;
}
