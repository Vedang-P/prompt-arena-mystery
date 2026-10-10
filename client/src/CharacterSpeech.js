// Live dialogue uses available OS voices. Act 0 uses bundled neural recordings.
const FEMALE = new Set(['mother','enakshi','elise']);
export function speakCharacter(character, text) {
  const synth=window.speechSynthesis;
  if(!synth)return()=>{};
  synth.cancel();
  const voices=synth.getVoices().filter(v=>/^en[-_]/i.test(v.lang));
  const names=FEMALE.has(character)?/Sonia|Zira|Karen|Victoria|Susan|Hazel|\bfemale\b/i:/David|Ryan|Daniel|Alex|Mark|Guy|\bmale\b/i;
  const voice=voices.find(v=>names.test(v.name)&&/natural|online/i.test(v.name))??voices.find(v=>names.test(v.name))??voices.find(v=>v.lang==='en-IN')??voices[0];
  const utterance=new SpeechSynthesisUtterance(text);
  if(voice)utterance.voice=voice;
  utterance.lang=voice?.lang??'en-GB';utterance.rate=.93;utterance.pitch=1;
  const active=value=>window.dispatchEvent(new CustomEvent('arena-speech',{detail:{active:value}}));
  utterance.onstart=()=>active(true);utterance.onend=utterance.onerror=()=>active(false);
  synth.speak(utterance);
  return()=>{synth.cancel();active(false);};
}
