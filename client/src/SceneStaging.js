import { BEDROOM, POLICE, DESK_SEAT, HOSPITAL_BED, PARK } from './SceneLayout.js';

export const SEAT = {sameer:.4707,parth:.4903,mother:.5212,officer:.4915,veer:.4878,tanush:.4841,leader:.4906,enakshi:.5163};
export const SITTING_SOLE={sameer:-.00452,parth:-.00475,mother:-.00019,officer:-.00468,veer:-.00477,tanush:-.00471,leader:-.00477,enakshi:0};
export function seatContact(character,seatY,floorY){
  const y=seatY-(SEAT[character]??.48);
  return {y,footLift:Math.max(0,floorY-y-(SITTING_SOLE[character]??0)+.003)};
}
// The wendigo mask is a physical prop, not just a hotspot marker: it lies on
// the bed whenever its clue hotspot is available in the room — act 7 onward,
// or any dev session that reveals every hotspot — with the story phases as the
// last word (the reveal shows it; once it is taken, it never comes back).
export function maskVisibleFor({hotspots=[],act=null,phase=null}={}) {
  if(phase==='mask_taken')return false;
  if(phase==='mask_reveal')return true;
  return hotspots.some(h=>h.puzzle==='p_mask_owner')||act==='act7'||act==='act8';
}
export function locationFor(act, kind, index) {
  const scenes = {
    act1:{intro:['parth_home','parth_home','parth_home','parth_home','parth_home','parth_home','parth_room'],outro:['parth_home','parth_home']},
    act2:{intro:['sameer_room','cyber_cafe','cyber_cafe','cyber_cafe','cyber_cafe','sameer_room','sameer_room'],outro:['sameer_room','sameer_room','sameer_room']},
    // The overheard call, the plea and the hiding under the desk all happen in
    // the archive room; Act IV picks up at the door.
    act3:{intro:['concert'],outro:['ngo_archive']},
    act4:{intro:['sameer_room','hospital'],outro:['hospital']},
    act5:{intro:['hospital','hospital','tanush_office'],outro:['sameer_room']},
    act6:{intro:['sameer_room'],outro:['police_station','sameer_room']},
    act7:{intro:['sameer_room'],outro:['sameer_room','sameer_room','hospital']},
    act8:{intro:['hospital'],outro:['hospital']},
  }[act.id]?.[kind];
  return scenes?.[Math.min(index,scenes.length-1)] ?? act.entry_room;
}
export function cinematicPhaseFor(act,kind,sceneId,index) {
  if(act.id==='act3'&&kind==='outro'&&sceneId==='ngo_hq')return index===0?'capture':'departure';
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
  // Act 7 opens on the mask at Sameer's bed: he studies it alone until the
  // narration names Veer at the knock. From then on the two stand face to face
  // by the bed — Sameer never turns his back on his visitor, and the bedroom
  // (not the desk or a generic home) frames the visit.
  if(act.id==='act7'&&kind==='intro'&&sceneId==='sameer_room'){
    if(index<1)return [{character:'sameer',at:[-1.35,-.6],rot:-2.048,pose:'idle',staged:true}];
    return [
      {character:'sameer',at:[.9,.35],rot:-2.051,pose:'idle',staged:true},
      {character:'veer',at:[-1.5,-.9],rot:1.091,pose:'idle',staged:true},
    ];
  }
  // The NGO blitz plays at the shopfront before Sameer ever reaches the
  // counter: the store beats stage him alone, and Ramu only appears for the
  // dosa-corner beat that follows.
  if(act.id==='act2'&&kind==='intro'&&sceneId==='cyber_cafe'&&index<4)
    return [{character:'sameer',pose:'idle'}];
  const capture=act.id==='act3'&&kind==='outro'&&sceneId==='ngo_hq';
  const discovery=act.id==='act4'&&kind==='outro'&&sceneId==='hospital';
  const companion=discovery?'parth':sceneId==='parth_home'?'mother':sceneId==='cyber_cafe'?'ramu':sceneId==='police_station'?'officer':sceneId==='tanush_office'?'tanush':act.id==='act8'?'leader':capture?null:(act.id==='act7'&&kind==='intro')||sceneId==='concert'?'veer':null;
  return ['sameer',...(companion?[companion]:[])].map((character,i)=>({
    character,
    at:capture?[4,3]:discovery?(character==='parth'?[HOSPITAL_BED.center[0]+.89,HOSPITAL_BED.center[2]]:[-2.75,-1.1]):[companion?(i-.5)*1.8:0,1],
    rot:capture?-.7:discovery?(character==='parth'?0:-Math.PI/2):i?-.2:.2,
    pose:discovery&&character==='parth'?'lie':sceneId==='sameer_room'&&character==='sameer'?'sit':'idle',
    wearingMask:act.id==='act8'&&kind==='intro'&&(character==='leader'||(character==='sameer'&&index>=5)),
    holdingMask:act.id==='act7'&&kind==='outro'&&character==='sameer'&&index>=1,
  }));
}
// All acts use these furniture-relative marks. Standing actors never inherit a
// seated origin; the raised gazebo and chair seats have explicit surfaces.
// Cinematic beats marked `staged` already carry room-space marks of their own
// (Act 7's bed-side confrontation) and keep them instead of a furniture default.
export function placeCast(sceneId,cast) {
  const people=[...cast];
  if(sceneId==='police_station'&&people.some(c=>c.character==='mother'))
    for(const character of ['sameer','officer'])if(!people.some(c=>c.character===character))people.push({character});
  return people.map((c,i)=>{
    const base={...c,pose:c.pose??'idle',at:c.at??[(i-.5)*1.8,1],rot:c.rot??0,y:.003,footLift:0};
    if(c.staged)return base;
    if(sceneId==='gazebo')return base.pose==='sit'
      ? {...base,at:[PARK.seat[0]+(c.character==='sameer'?-.5:.5),PARK.seat[1]],rot:0,...seatContact(c.character,PARK.seatY,PARK.deckY)}
      : {...base,at:people.length===1?PARK.waiting:[i?1.15:-1.15,.15],y:PARK.deckY+.003};
    if(['sameer_room','parth_room'].includes(sceneId))return base.pose==='sit'
      ? {...base,at:[BEDROOM.chair[0],BEDROOM.chair[2]],rot:Math.PI/2,...seatContact(c.character,DESK_SEAT,0)}
      : {...base,at:[people.length===1?.15:(i-.5)*1.5,1.05],rot:c.rot??0};
    if(sceneId==='police_station')return c.character==='officer'
      ? {...base,at:POLICE.officer,pose:'sit',rot:0,...seatContact(c.character,DESK_SEAT,0)}
      : {...base,at:POLICE[c.character]??[1.5,1],rot:Math.PI};
    // The patient lies on his back along the bed: the rig is rotated in
    // HumanActor, so the group origin (his feet) sits at the bed's +x end and
    // the group is raised so his back rests on the mattress.
    if(sceneId==='hospital'&&c.character==='parth'&&base.pose==='lie')
      return {...base,at:[HOSPITAL_BED.center[0]+.89,HOSPITAL_BED.center[2]],rot:0,y:HOSPITAL_BED.mattressY+.15,footLift:0};
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
  // The prologue's actors sit inside the gazebo; frame the structure itself —
  // roof and posts included — at every aspect, with the cast inside the shot.
  if(roomId==='gazebo'){
    // Distance calibrated so the roof clears the frame at thin portrait
    // aspects (the previous fit assumed the cast sat at the front edge).
    shot.center[0]=.1;shot.center[1]=1.5;shot.center[2]=-.2;
    const distance=Math.max(7.8,11.9*Math.pow(.75/Math.max(.25,aspect),.67));
    shot.at[0]=.35;
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
