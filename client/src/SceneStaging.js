import { BEDROOM, POLICE, DESK_SEAT, PARK } from './SceneLayout.js';

export const SEAT = {sameer:.4707,parth:.4903,mother:.5212,officer:.4915,veer:.4878,tanush:.4841,leader:.4906,enakshi:.5163};
export const SITTING_SOLE={sameer:-.00452,parth:-.00475,mother:-.00019,officer:-.00468,veer:-.00477,tanush:-.00471,leader:-.00477,enakshi:0};
export function seatContact(character,seatY,floorY){
  const y=seatY-(SEAT[character]??.48);
  return {y,footLift:Math.max(0,floorY-y-(SITTING_SOLE[character]??0)+.003)};
}
export function locationFor(act, kind, index) {
  const scenes = {
    act1:{intro:['parth_home','parth_home','parth_home','parth_home','parth_room'],outro:['parth_room']},
    act2:{intro:['gazebo','gazebo','sameer_room'],outro:['sameer_room']},
    act3:{intro:['concert'],outro:['workshop','workshop','sameer_room']},
    act4:{intro:['sameer_room','hospital'],outro:['hospital']},
    act5:{intro:['hospital','hospital','tanush_office'],outro:['sameer_room']},
    act6:{intro:['sameer_room'],outro:['police_station','sameer_room']},
    act7:{intro:['sameer_room'],outro:['sameer_room','sameer_room','hospital']},
    act8:{intro:['hospital'],outro:['hospital']},
  }[act.id]?.[kind];
  return scenes?.[Math.min(index,scenes.length-1)] ?? act.entry_room;
}
export function storyCast(act,kind,sceneId) {
  const companion=sceneId==='parth_home'?'mother':sceneId==='police_station'?'officer':sceneId==='tanush_office'?'tanush':act.id==='act8'?'leader':(act.id==='act7'&&kind==='intro')||sceneId==='concert'?'veer':null;
  return ['sameer',...(companion?[companion]:[])].map((character,i)=>({character,at:[companion?(i-.5)*1.8:0,1],rot:i?-.2:.2,pose:sceneId==='sameer_room'&&character==='sameer'?'sit':'idle'}));
}
// All acts use these furniture-relative marks. Standing actors never inherit a
// seated origin; the raised gazebo and chair seats have explicit surfaces.
export function placeCast(sceneId,cast) {
  const people=[...cast];
  if(sceneId==='police_station'&&people.some(c=>c.character==='mother'))
    for(const character of ['sameer','officer'])if(!people.some(c=>c.character===character))people.push({character});
  return people.map((c,i)=>{
    const base={...c,pose:c.pose??'idle',at:c.at??[(i-.5)*1.8,1],rot:c.rot??0,y:.003,footLift:0};
    if(sceneId==='gazebo')return base.pose==='sit'
      ? {...base,at:[c.character==='sameer'?-.54:.54,.99],rot:0,...seatContact(c.character,PARK.seatY,PARK.deckY)}
      : {...base,at:people.length===1?PARK.waiting:[i?1.15:-1.15,.15],y:PARK.deckY+.003};
    if(['sameer_room','parth_room'].includes(sceneId))return base.pose==='sit'
      ? {...base,at:[BEDROOM.chair[0],BEDROOM.chair[2]],rot:Math.PI/2,...seatContact(c.character,DESK_SEAT,0)}
      : {...base,at:[people.length===1?.15:(i-.5)*1.5,1.05],rot:c.rot??0};
    if(sceneId==='police_station')return c.character==='officer'
      ? {...base,at:POLICE.officer,pose:'sit',rot:0,...seatContact(c.character,DESK_SEAT,0)}
      : {...base,at:POLICE[c.character]??[1.5,1],rot:Math.PI};
    // Office marks avoid the central chair and the raised rugs entirely.
    if(sceneId==='tanush_office')return {...base,at:[c.character==='tanush'?2:-1.6,1.6],rot:c.character==='tanush'?-.35:.35};
    return base;
  });
}
export function wideShot(cast,aspect=16/9) {
  const xs=cast.map(c=>c.at[0]),zs=cast.map(c=>c.at[1]);
  const center=[xs.length?(Math.min(...xs)+Math.max(...xs))/2:0,1.1,zs.length?(Math.min(...zs)+Math.max(...zs))/2:0];
  const halfWidth=xs.length?(Math.max(...xs)-Math.min(...xs))/2+.65:1.4;
  const depth=zs.length?(Math.max(...zs)-Math.min(...zs))/2:0;
  const tan=Math.tan(39*Math.PI/360);
  const distance=Math.max(5.7,halfWidth/(tan*Math.max(.25,aspect)*.8)+depth,1.55/(tan*.82)+depth);
  return {center,at:[center[0]+.25,center[1]+distance*.16,center[2]+distance]};
}
