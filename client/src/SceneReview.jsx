// Loaded only in Vite development. Uses the real directors without session writes.
import {useEffect,useState} from 'react';
import ActDirector from './ActDirector.jsx';
import CinematicStory from './CinematicStory.jsx';
import Scene from './Scene.jsx';
import {locationFor,storyCast} from './SceneStaging.js';
import {useSettings} from './Settings.jsx';
import Soundtrack from './Soundtrack.jsx';
export default function SceneReview(){
  const [data,setData]=useState(null),[index,setIndex]=useState(0),[readyScene,setReadyScene]=useState(null),[showReview,setShowReview]=useState(true);
  const {quality,update}=useSettings(),[metrics,setMetrics]=useState(null);
  const [showHotspots,setShowHotspots]=useState(false);
  const [audioPreview,setAudioPreview]=useState(false);
  const [error,setError]=useState(null);
  useEffect(()=>{fetch('/api/dev/scene-review').then(r=>{if(!r.ok)throw Error(`review endpoint returned ${r.status}`);return r.json();}).then(setData).catch(e=>setError(e.message));},[]);
  if(error)return <p role="alert">Scene review is unavailable here ({error}). Start it with <code>npm run dev:game</code> and open <code>/?review=scenes</code>.</p>;
  if(!data)return <p>Preparing scene review…</p>;
  const entries=[];
  for(const act of data.acts){
    for(const beat of act.beats??[])entries.push({label:`${act.id} / ${beat.id}`,act:{...act,beats:[beat]},beat});
    for(const kind of ['intro','outro']){
      const seen=new Set();
      for(const [lineIndex,line] of (act[kind]??[]).entries()){
        const room=locationFor(act,kind,lineIndex),shot=lineIndex%3===0?'wide':line.speaker==='narrator'?'two':'portrait';
        const key=room+shot+line.speaker+JSON.stringify(storyCast(act,kind,room,lineIndex));
        if(seen.has(key))continue;seen.add(key);
        entries.push({label:`${act.id} / ${kind} ${lineIndex+1} / ${room} / ${shot}`,act,kind,lineIndex});
      }
    }
  }
  for(const room of data.rooms??[])entries.push({label:`Environment / ${room.id} / ${room.name}`,room});
  const entry=entries[index];
  const audioRoom=entry.room?.id??entry.beat?.room??(entry.act&&entry.kind?locationFor(entry.act,entry.kind,entry.lineIndex):'gazebo');
  const roomActs={gazebo:'act2',parth_home:'act1',police_station:'act6',sameer_room:'act2',parth_room:'act1',abandoned_field:'act2',cyber_cafe:'act2',concert:'act3',workshop:'act3',ngo_hq:'act3',ngo_archive:'act3',hospital:'act4',tanush_office:'act5',enakshi_house:'act5'};
  const reviewRooms=data.rooms.map(room=>({...room,hotspots:room.hotspots.filter(h=>(!h.act||h.act===roomActs[room.id])&&(showHotspots||h.type==='character'))}));
  return <>
    <Soundtrack roomId={audioRoom} enabledOverride={audioPreview}/>
    {entry.room?<div data-scene-ready={readyScene===index} style={{position:'fixed',inset:0}}><Scene key={index} state={{rooms:reviewRooms,characters:data.characters,discovered:[],solvedPuzzles:[]}} roomId={entry.room.id} onReady={()=>setReadyScene(index)} onMetrics={setMetrics} onCharacter={()=>{}} onClue={()=>{}} onPuzzle={()=>{}} onTravel={()=>{}}/>{showReview&&<p style={{position:'absolute',bottom:0,padding:12,background:'#10212a'}}>{entry.room.name} · Environment review <output aria-label="Scene performance">{metrics?` / ${metrics.fps} FPS / ${metrics.p95} ms p95 / ${metrics.geometries} geometries / ${metrics.textures} textures / ${metrics.calls} draws / ${metrics.triangles} triangles`:''}</output></p>}</div>:entry.beat?<ActDirector key={index} act={entry.act} characters={data.characters} onComplete={()=>{}} review/>:<CinematicStory key={index} act={entry.act} characters={data.characters} story={{lines:entry.act[entry.kind],after:entry.kind,doneLabel:'Return to game'}} initialIndex={entry.lineIndex} initiallyPaused onDone={()=>{}}/>}
    {showReview&&<nav aria-label="Development scene review" style={{position:'fixed',top:0,left:'12%',right:'12%',zIndex:200,display:'flex',background:'#14282b',fontSize:12}}><select aria-label="Scene review" value={index} onChange={e=>{setMetrics(null);setIndex(Number(e.target.value));}} style={{minWidth:0,width:'100%'}}>{entries.map((e,i)=><option key={i} value={i}>{e.label}</option>)}</select><select aria-label="Review graphics" value={quality} onChange={e=>update({quality:e.target.value})}><option value="low">Low</option><option value="medium">Balanced</option><option value="high">High</option></select><label style={{display:'flex',alignItems:'center'}}>Hotspots<input type="checkbox" checked={showHotspots} onChange={e=>setShowHotspots(e.target.checked)}/></label><label style={{display:'flex',alignItems:'center'}}>Audio<input aria-label="Scene audio preview" type="checkbox" checked={audioPreview} onChange={e=>setAudioPreview(e.target.checked)}/></label><button onClick={()=>{setMetrics(null);setIndex((index+1)%entries.length);}}>Next review scene</button><button onClick={()=>setShowReview(false)}>Hide review controls</button></nav>}
  </>;
}
