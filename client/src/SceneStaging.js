import { BEDROOM, POLICE, DESK_SEAT, HOSPITAL_BED, PARK } from './SceneLayout.js';

export const SEAT = {sameer:.4707,parth:.4903,mother:.5212,officer:.4915,veer:.4878,tanush:.4841,leader:.4906,enakshi:.5163};
export const SITTING_SOLE={sameer:-.00452,parth:-.00475,mother:-.00019,officer:-.00468,veer:-.00477,tanush:-.00471,leader:-.00477,enakshi:0};
export function seatContact(character,seatY,floorY){
  const y=seatY-(SEAT[character]??.48);
  return {y,footLift:Math.max(0,floorY-y-(SITTING_SOLE[character]??0)+.003)};
}
export function locationFor(act, kind, index) {
  const scenes = {
    act1:{intro:['parth_home','parth_home','parth_home','parth_home','parth_room'],outro:['parth_room']},
    act2:{intro:['sameer_room','cyber_cafe','sameer_room','sameer_room'],outro:['sameer_room']},
    act3:{intro:['concert'],outro:['concert','concert','sameer_room']},
    act4:{intro:['sameer_room','hospital'],outro:['hospital']},
    act5:{intro:['hospital','hospital','tanush_office'],outro:['sameer_room']},
    act6:{intro:['sameer_room'],outro:['police_station','sameer_room']},
    act7:{intro:['sameer_room'],outro:['sameer_room','sameer_room','hospital']},
    act8:{intro:['hospital'],outro:['hospital']},
  }[act.id]?.[kind];
  return scenes?.[Math.min(index,scenes.length-1)] ?? act.entry_room;
}
export function cinematicPhaseFor(act,kind,sceneId,index) {
  if(act.id==='act3'&&kind==='outro'&&sceneId==='concert')return index===0?'capture':'departure';
  if(act.id==='act6'&&kind==='outro'&&sceneId==='sameer_room')return 'mask_reveal';
  if(act.id==='act7'&&kind==='intro'&&sceneId==='sameer_room')return 'mask_reveal';
  if(act.id==='act7'&&kind==='outro'&&sceneId==='sameer_room')return index===0?'mask_reveal':'mask_taken';
  if(act.id==='act7'&&kind==='outro'&&sceneId==='hospital')return 'cargo_loading';
  if(act.id==='act8'&&kind==='outro'&&sceneId==='hospital')return ['ending_fire','ending_fire','ending_phone','ending_voice','ending_fall'][index]??'ending_fall';
  return null;
}
export function storyCast(act,kind,sceneId,index=0) {
  if(act.id==='act7'&&kind==='outro'&&sceneId==='hospital')
    return [{character:'sameer',at:[1.9,.85],rot:-Math.PI/2,pose:'idle'}];
  if(act.id==='act8'&&kind==='outro'){
    const position=index<2?[0,-4.8]:index===4?[0,2.4]:[1.1,.8];
    return [{character:'sameer',at:position,rot:index<2?Math.PI:index<4?Math.PI/2:0,pose:index===4?'fall':'idle',rotationX:index===4?Math.PI/2:index===0?-.12:0}];
  }
  const capture=act.id==='act3'&&kind==='outro'&&sceneId==='concert';
  const discovery=act.id==='act4'&&kind==='outro'&&sceneId==='hospital';
  const companion=discovery?'parth':sceneId==='parth_home'?'mother':sceneId==='cyber_cafe'?'ramu':sceneId==='police_station'?'officer':sceneId==='tanush_office'?'tanush':act.id==='act8'?'leader':capture?null:(act.id==='act7'&&kind==='intro')||sceneId==='concert'?'veer':null;
  return ['sameer',...(companion?[companion]:[])].map((character,i)=>({
    character,
    at:capture?[4,3]:discovery?(character==='parth'?[HOSPITAL_BED.center[0],HOSPITAL_BED.center[2]]:[-2.75,-1.1]):[companion?(i-.5)*1.8:0,1],
    rot:capture?-.7:discovery?(character==='parth'?Math.PI/2:-Math.PI/2):i?-.2:.2,
    pose:discovery&&character==='parth'?'sit':sceneId==='sameer_room'&&character==='sameer'?'sit':'idle',
    wearingMask:act.id==='act8'&&kind==='intro'&&(character==='leader'||(character==='sameer'&&index>=5)),
    holdingMask:act.id==='act7'&&kind==='outro'&&character==='sameer'&&index>=1,
  }));
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
    if(sceneId==='hospital'&&c.character==='parth'&&base.pose==='sit')
      return {...base,at:[HOSPITAL_BED.center[0],HOSPITAL_BED.center[2]],rot:Math.PI/2,...seatContact('parth',HOSPITAL_BED.mattressY,0)};
    if(sceneId==='cyber_cafe')return c.character==='ramu'
      ? {...base,at:[-5.15,2.1],rot:.1}
      : {...base,at:[-3.15,3.4],rot:-2.1};
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

export function roomWideShot(roomId,cast,aspect=16/9) {
  const shot=wideShot(cast,aspect);
  // The prologue's actors sit inside the gazebo; include the roof and posts in
  // the establishing frame instead of solving the shot from the actors alone.
  if(roomId==='gazebo'){
    shot.center[1]=1.5;
    const distance=Math.max(shot.at[2]-shot.center[2],7.8,1.14+2.15/(Math.tan(39*Math.PI/360)*Math.max(.25,aspect)*.86));
    shot.at[2]=shot.center[2]+distance;
    shot.at[1]=shot.center[1]+distance*.16;
  }
  return shot;
}

// Frame the ambulance, its loading area, and Sameer together. The shot backs
// off on narrow screens instead of cutting Sameer off beside the dumpsters.
export function captureShot(aspect=16/9) {
  const center=[1.2,1.1,-.55],tan=Math.tan(39*Math.PI/360);
  const distance=Math.max(8.5,10.2/(2*tan*Math.max(.25,aspect))+2);
  return {center,at:[1.4,center[1]+distance*.16,center[2]+distance]};
}
