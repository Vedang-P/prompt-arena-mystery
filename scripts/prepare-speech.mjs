import fs from 'node:fs/promises';
import {caseData} from '../src/case.js';
import {speechKey,normalizeSpeech} from '../client/src/SpeechCatalog.js';
const tasks=new Map();
function add(speaker,text){if(!text?.trim())return;const key=speechKey(speaker,text);const prior=tasks.get(key);if(prior&&prior.text!==normalizeSpeech(text))throw Error('Speech hash collision');tasks.set(key,{key,speaker,text:normalizeSpeech(text)});return key;}
const prologue={};
for(const act of caseData.acts){
  for(const beat of act.beats??[])for(const [i,line] of beat.lines.entries())prologue[`${beat.id}-${i}`]=add(line.speaker,line.text);
  for(const line of [...act.intro??[],...act.outro??[]])add(line.speaker,line.text);
}
for(const character of caseData.characters){
  for(const text of [...character.facts.map(f=>f.text),...character.deflections??[],...character.snubs??[]])add(character.id,text);
  add(character.id,"That isn't how I remember it. I can't give you that answer.");
  add(character.id,`${character.name} says nothing for a moment, then changes the subject.`);
}
for(const qa of caseData.canonical_qa??[])add(qa.character,qa.a);
await fs.mkdir('.asset-cache',{recursive:true});
await fs.writeFile('.asset-cache/speech-tasks.json',JSON.stringify({tasks:[...tasks.values()],prologue},null,2));
console.log(`Prepared ${tasks.size} unique lines; ${Object.keys(prologue).length} prologue cues, every act intro/outro and authored character reply.`);
