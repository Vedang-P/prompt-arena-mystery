// Loaded only in Vite development. Uses the real directors without session writes.
import {useEffect,useState} from 'react';
import ActDirector from './ActDirector.jsx';
import CinematicStory from './CinematicStory.jsx';
import Scene from './Scene.jsx';
import {locationFor,storyCast} from './SceneStaging.js';
export default function SceneReview(){
  const [data,setData]=useState(null),[index,setIndex]=useState(0),[readyScene,setReadyScene]=useState(null),[showReview,setShowReview]=useState(true);
  useEffect(()=>{fetch('/api/dev/scene-review').then(r=>r.json()).then(setData);},[]);
  if(!data)return <p>Preparing scene review…</p>;
  const entries=[];
  for(const act of data.acts){
    for(const beat of act.beats??[])entries.push({label:`${act.id} / ${beat.id}`,act:{...act,beats:[beat]},beat});
    for(const kind of ['intro','outro']){
      const seen=new Set();
      for(const [lineIndex,line] of (act[kind]??[]).entries()){
        const room=locationFor(act,kind,lineIndex),shot=lineIndex%3===0?'wide':line.speaker==='narrator'?'two':'portrait';
        const key=room+shot+line.speaker+JSON.stringify(storyCast(act,kind,room));
        if(seen.has(key))continue;seen.add(key);
        entries.push({label:`${act.id} / ${kind} ${lineIndex+1} / ${room} / ${shot}`,act,kind,lineIndex});
      }
    }
  }
  for(const room of data.rooms??[])entries.push({label:`Environment / ${room.id} / ${room.name}`,room});
  const entry=entries[index];
  return <>
    {entry.room?<div data-scene-ready={readyScene===index} style={{position:'fixed',inset:0}}><Scene key={index} state={{rooms:data.rooms,characters:data.characters,discovered:[],solved_puzzles:[]}} roomId={entry.room.id} onReady={()=>setReadyScene(index)} onCharacter={()=>{}} onClue={()=>{}} onPuzzle={()=>{}} onTravel={()=>{}}/><p style={{position:'absolute',bottom:0,padding:12,background:'#10212a'}}>{entry.room.name} · Environment review</p></div>:entry.beat?<ActDirector key={index} act={entry.act} characters={data.characters} onComplete={()=>{}} review/>:<CinematicStory key={index} act={entry.act} characters={data.characters} story={{lines:entry.act[entry.kind],after:entry.kind,doneLabel:'Return to game'}} initialIndex={entry.lineIndex} initiallyPaused onDone={()=>{}}/>}
    {showReview&&<nav aria-label="Development scene review" style={{position:'fixed',top:0,left:'25%',right:'25%',zIndex:200,display:'flex',background:'#14282b',fontSize:12}}><select aria-label="Scene review" value={index} onChange={e=>setIndex(Number(e.target.value))} style={{minWidth:0,width:'100%'}}>{entries.map((e,i)=><option key={i} value={i}>{e.label}</option>)}</select><button onClick={()=>setIndex((index+1)%entries.length)}>Next review scene</button><button onClick={()=>setShowReview(false)}>Hide review controls</button></nav>}
  </>;
}
