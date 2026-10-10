import { speechKey } from './SpeechCatalog.js';
import { publishSpeech, speechMotion } from './VoicePlayback.js';
let catalog;
export function getVoiceTrack(speaker,text) {
  catalog ??= fetch('/assets/audio/voices/manifest.json').then(r=>{if(!r.ok)throw Error('Voice catalog unavailable');return r.json();}).catch(error=>{catalog=null;throw error;});
  return catalog.then(manifest=>manifest[speechKey(speaker,text)]??null);
}
export function releaseSpeech(audio) {
  audio?.pause();
  if(speechMotion.audio===audio)publishSpeech(null,null);
}
