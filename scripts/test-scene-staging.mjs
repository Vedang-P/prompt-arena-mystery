import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AnimationMixer,Box3,PerspectiveCamera,Raycaster,Vector3} from 'three';
import {caseData} from '../src/case.js';
import {locationFor,storyCast,placeCast,wideShot,roomWideShot,captureShot,cinematicPhaseFor} from '../client/src/SceneStaging.js';
import {createFootContact} from '../client/src/FootContact.js';
import {PARK,BEDROOM,SAMEER_BED,DETAIL_ANCHORS,HOME_STAIRS,HOME_UPPER_DOORWAY,HOME_BEDROOM,backWallPanels,DESK_TOP,FIELD,FIELD_TRACKS,ROOM_VIEWS,updateFieldBackpackOrbit,updateHospitalSecurityOrbit} from '../client/src/SceneLayout.js';
import {loadGeometry} from './gltf-geometry.mjs';
const scenes=[];
for(const act of caseData.acts){
  for(const beat of act.beats??[])for(const line of beat.lines)scenes.push({room:beat.room,cast:beat.cast,line});
  for(const kind of ['intro','outro'])for(const [index,line] of (act[kind]??[]).entries()){
    const room=locationFor(act,kind,index);scenes.push({room,cast:storyCast(act,kind,room),line});
  }
}
const measurements=JSON.parse(await fs.readFile('.asset-cache/actor-measurements.json','utf8'));
const act2=caseData.acts.find(act=>act.id==='act2'),act3=caseData.acts.find(act=>act.id==='act3'),act4=caseData.acts.find(act=>act.id==='act4'),act7=caseData.acts.find(act=>act.id==='act7'),act8=caseData.acts.find(act=>act.id==='act8');
assert.equal(locationFor(act2,'intro',4),'cyber_cafe','The café scene must accompany the café narration');
assert.equal(locationFor(act3,'outro',0),'ngo_archive','The overheard call must stage in the archive room');
assert.equal(locationFor(act3,'outro',act3.outro.length-1),'ngo_archive','The overheard call must stay in the archive room until Sameer hides');
assert.match(act3.outro.at(-1).text,/He hid under the desk/,'Act 3 must close on Sameer hiding under the desk');
assert.equal((act4.intro??[]).length,0,'Act 4 must open at the door, with the call already told in Act 3');
const discoveryCast=placeCast('hospital',storyCast(act4,'outro','hospital',0));
const parthDiscovery=discoveryCast.find(c=>c.character==='parth');
assert(parthDiscovery,'Act 4 discovery must show Parth in the ward');
assert.equal(parthDiscovery.pose,'lie','Parth must lie on the mattress during the discovery');
assert(Math.abs(parthDiscovery.y-.15-.84002)<.002,'Parth must rest on the measured hospital mattress surface');
assert(discoveryCast.find(c=>c.character==='sameer'),'Sameer must be present for the reunion');
const maskCastBefore=storyCast(act8,'intro','hospital',4),maskCastAfter=storyCast(act8,'intro','hospital',5);
assert(!maskCastBefore.find(c=>c.character==='sameer').wearingMask,'Sameer must not wear the mask before the leader puts it on him');
assert(maskCastAfter.find(c=>c.character==='sameer').wearingMask,'Sameer must wear the physical mask after the leader puts it on him');
assert(maskCastAfter.find(c=>c.character==='leader').wearingMask,'The leader must wear the cult mask at the ritual');
assert.deepEqual(Array.from({length:5},(_,i)=>cinematicPhaseFor(act8,'outro','hospital',i)),['ending_fire','ending_fire','ending_phone','ending_voice','ending_fall'],'Act 8 ending must progress through its burning room, phone, voice note and fall beats');
for(let i=0;i<act8.outro.length;i++){
  const endingCast=storyCast(act8,'outro','hospital',i);
  assert.equal(endingCast.length,1,'The leader must not stand alive beside Sameer during the post-ritual ending');
  assert.equal(endingCast[0].character,'sameer','Sameer must carry the final hospital scene');
}
assert.equal(storyCast(act8,'outro','hospital',4)[0].pose,'fall','The last Act 8 cue must stage Sameer falling');
assert.equal(storyCast(act8,'outro','hospital',4)[0].rotationX,Math.PI/2,'The last Act 8 cue must lay Sameer on the floor');
assert(Math.abs(storyCast(act8,'outro','hospital',0)[0].rotationX)>0,'Sameer must lean toward the burning window before the voice note');
assert.equal(cinematicPhaseFor(act7,'outro','hospital',2),'cargo_loading','Act 7 arrival must use a loading-bay story phase');
assert.deepEqual(storyCast(act7,'outro','hospital',2)[0].at,[1.9,.85],'Sameer must stand beside the loading path instead of blocking it');
assert.equal(storyCast(act7,'outro','hospital',2)[0].rot,-Math.PI/2,'Sameer must face the loading activity');
const maskPickup=storyCast(act7,'outro','sameer_room',1).find(c=>c.character==='sameer');
assert(maskPickup.holdingMask,'Sameer must pick up the mask when the closing narration says he does');
const maskHotspot=caseData.rooms.find(r=>r.id==='sameer_room').hotspots.find(h=>h.id==='sameer_room_a7_mask');
assert.deepEqual(maskHotspot.position,[-2.8,.705,-1.35],'The Act 7 mask clue must be positioned on Sameer’s bed');
assert.deepEqual(DETAIL_ANCHORS.sameer_room.sameer_room_a7_mask,[SAMEER_BED.center[0],SAMEER_BED.surfaceY+.018,SAMEER_BED.center[2]],'The mask marker must share its measured bed surface anchor');
// Act 7 opening: Veer must not be on stage before the narration names him; he
// arrives with the knock and the two stand face to face in the bedroom — not
// Sameer sitting at his desk with his back turned — so the room, not a generic
// home or office, frames the visit.
const maskBeatCast=placeCast('sameer_room',storyCast(act7,'intro','sameer_room',0));
assert.equal(maskBeatCast.length,1,'Veer must not appear before his name is mentioned');
const maskBeatSameer=maskBeatCast[0];
const turn=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const maskHeading=Math.atan2(SAMEER_BED.center[0]-maskBeatSameer.at[0],SAMEER_BED.center[2]-maskBeatSameer.at[1]);
assert(turn(maskBeatSameer.rot,maskHeading)<.3,'Sameer must face the mask on his bed before the knock');
const visitCast=placeCast('sameer_room',storyCast(act7,'intro','sameer_room',1));
const visitSameer=visitCast.find(c=>c.character==='sameer'),visitVeer=visitCast.find(c=>c.character==='veer');
assert(visitSameer&&visitVeer,'Veer must arrive once the narration names him');
const visitHeading=Math.atan2(visitVeer.at[0]-visitSameer.at[0],visitVeer.at[1]-visitSameer.at[1]);
assert(turn(visitSameer.rot,visitHeading)<.2,'Sameer must face Veer during the Act 7 opening');
assert(turn(visitVeer.rot,visitHeading+Math.PI)<.2,'Veer must face Sameer during the Act 7 opening');
assert(Math.hypot(visitVeer.at[0]-visitSameer.at[0],visitVeer.at[1]-visitSameer.at[1])>1.5,'The pair must have room to face one another');
const inside=(p,rect)=>p[0]>rect[0]&&p[0]<rect[1]&&p[1]>rect[2]&&p[1]<rect[3];
for(const c of [maskBeatSameer,visitSameer,visitVeer])
  for(const [name,rect] of [['bed',[-3.65,-1.95,-2.445,-.255]],['desk',[2.326,3.274,-2.5,-.5]],['chair',[1.429,2.131,-1.85,-1.15]],['bedside cabinet',[-1.856,-1.244,-2.276,-1.724]]])
    assert(!inside(c.at,rect),`An Act 7 opening actor intersects the ${name}`);
for(const aspect of [1280/600,1920/780,390/520,844/220]){
  const shot=wideShot(visitCast,aspect),camera=new PerspectiveCamera(39,aspect,.1,100);
  camera.position.set(...shot.at);camera.lookAt(new Vector3(...shot.center));camera.updateMatrixWorld();
  for(const c of visitCast){const p=new Vector3(c.at[0],c.y,c.at[1]).project(camera);assert(Math.abs(p.x)<.88&&Math.abs(p.y)<.9,`The Act 7 opening pair is cropped at ${aspect}`);}
}
// The service-yard capture set stays wired for the capture/departure phase —
// keep its staging and framing regression-checked for whichever act stages it next.
const captureCast=placeCast('ngo_hq',storyCast(act3,'outro','ngo_hq'));
const sameerCapture=captureCast.find(c=>c.character==='sameer');
assert(sameerCapture,'Sameer must be present in the capture scene');
assert(Math.hypot(sameerCapture.at[0]-5.45,sameerCapture.at[1]-1.05)>1.8,'Sameer must remain visible beside, not behind, the trash cans');
for(const aspect of [390/520,676/490,844/390,1280/600,1920/780]){
  const shot=captureShot(aspect),camera=new PerspectiveCamera(39,aspect,.1,100);
  camera.position.set(...shot.at);camera.lookAt(new Vector3(...shot.center));camera.updateMatrixWorld();
  for(const [label,point] of [['Sameer-feet',[sameerCapture.at[0],0,sameerCapture.at[1]]],['Sameer-head',[sameerCapture.at[0],1.85,sameerCapture.at[1]]],['ambulance-roof',[-.5,2.45,-3.1]]]){
    const p=new Vector3(...point).project(camera);
    assert(Math.abs(p.x)<.92&&Math.abs(p.y)<.95,`${label} is cropped in Act 3 at ${aspect}`);
  }
}
const gazebo=await loadGeometry('client/public/assets/cinema/gazebo.glb');
const gazeboBounds=new Box3().setFromObject(gazebo.scene,true),gazeboHeight=gazeboBounds.max.y-gazeboBounds.min.y;
const gazeboScale=3.32/gazeboHeight,gazeboCast=placeCast('gazebo',[{character:'sameer',pose:'sit'},{character:'parth',pose:'sit'}]);
for(const aspect of [390/520,676/490,1280/720,1920/1080]){
  const shot=roomWideShot('gazebo',gazeboCast,aspect),camera=new PerspectiveCamera(39,aspect,.1,100);
  camera.position.set(...shot.at);camera.lookAt(new Vector3(...shot.center));camera.updateMatrixWorld();
  for(const x of [gazeboBounds.min.x*gazeboScale,gazeboBounds.max.x*gazeboScale])for(const z of [gazeboBounds.min.z*gazeboScale,gazeboBounds.max.z*gazeboScale]){
    const top=new Vector3(x,3.32,z).project(camera);
    assert(Math.abs(top.x)<.94&&Math.abs(top.y)<.94,`Gazebo roof is cropped at ${aspect}`);
  }
}
assert(measurements.ramu?.idle,"Ramu's Rocketbox actor must be included in the contact measurements");
const cafeCast=placeCast('cyber_cafe',storyCast(act2,'intro','cyber_cafe'));
assert(cafeCast.some(c=>c.character==='ramu'),'The café cinematic must stage Ramu');
assert(Math.hypot(cafeCast[0].at[0]-cafeCast[1].at[0],cafeCast[0].at[1]-cafeCast[1].at[1])>1.5,'Sameer and Ramu must have room to face one another');
let projections=0;
for(const scene of scenes){
  const cast=placeCast(scene.room,scene.cast);
  for(const c of cast){
    const sole=measurements[c.character]?.[c.pose]?.sole??0;
    const floor=scene.room==='gazebo'?PARK.deckY:0;
    assert(c.y+sole+(c.footLift??0)>=floor-.001,`${scene.room} ${c.character}: foot below surface`);
    if(scene.room==='parth_room'&&c.pose!=='sit')assert(c.at[0]>-.6&&c.at[1]>.6,'Actor intersects bedroom furniture');
  }
  for(const aspect of [1280/600,1920/780,390/520,844/220]){
    const shot=wideShot(cast,aspect),camera=new PerspectiveCamera(39,aspect,.1,100);
    camera.position.set(...shot.at);camera.lookAt(new Vector3(...shot.center));camera.updateMatrixWorld();
    for(const c of cast)for(const y of [c.y, c.y+(measurements[c.character]?.[c.pose]?.height??1.85)]){
      const p=new Vector3(c.at[0],y,c.at[1]).project(camera);
      assert(Math.abs(p.x)<.88&&Math.abs(p.y)<.9,`${scene.room} ${c.character} cropped at ${aspect}`);projections++;
    }
  }
}
// Exercise the actual skinned vertices after floor contact at every frame.
for(const character of ['sameer','parth','officer']){
  const {scene,animations}=await loadGeometry(`client/public/assets/cast/${character}.glb`);
  const contact=createFootContact(scene),mixer=new AnimationMixer(scene);
  const clip=animations.find(a=>a.name==='sit');mixer.clipAction(clip).play();
  for(const room of ['gazebo','sameer_room','parth_room','police_station']){
    const c=placeCast(room,[{character,pose:'sit'}]).find(c=>c.character===character);
    for(let i=0;i<25;i++){
      mixer.setTime(clip.duration*i/25);contact(c.footLift);scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
      const box=new Box3().setFromObject(scene,true),floor=room==='gazebo'?PARK.deckY:0;
      assert(box.min.y+c.y>=floor-.004,`${room} ${character}: animated sole ${box.min.y+c.y} below ${floor}`);
    }
  }
}
const fan=await loadGeometry('client/public/assets/cinema/ceiling_fan.glb');
assert(fan.scene.getObjectByName('ceiling_fan_blades'),'Fan rotor missing');
const fanBox=new Box3().setFromObject(fan.scene,true);
assert(Math.abs(fanBox.max.y)<.003&&fanBox.min.y>-.6,'Fan is not mounted downward from ceiling');
const stairAsset=await loadGeometry('client/public/assets/detail/stairs.glb');
stairAsset.scene.rotation.y=Math.PI/2;stairAsset.scene.position.set(4.7,0,.65);stairAsset.scene.updateMatrixWorld(true);
const stairBounds=new Box3().setFromObject(stairAsset.scene,true);
assert(Math.abs(stairBounds.min.y)<.002,'The stair foot must meet the ground floor');
assert(stairBounds.max.y>HOME_STAIRS.top+.7&&stairBounds.max.y<HOME_STAIRS.top+1.1,'The datum must sit one guard-rail height below the stair bounds top (the rail, not the tread)');
const stairTopHit=new Raycaster(new Vector3(4.7,20,-1.45),new Vector3(0,-1,0)).intersectObject(stairAsset.scene,true)[0];
assert(stairTopHit&&Math.abs(stairTopHit.point.y-HOME_STAIRS.top)<.02,'Upper landing datum must follow the imported stair top tread, not its handrail');
assert(Math.abs(HOME_STAIRS.landingY+HOME_STAIRS.landingSize[1]/2-HOME_STAIRS.top)<.002,'Landing must meet the stair top without a step or gap');
const stairTop=new Box3();stairAsset.scene.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(v.y>HOME_STAIRS.top-.12)stairTop.expandByPoint(v);}}});
const landingMin=[HOME_STAIRS.landingCenter[0]-HOME_STAIRS.landingSize[0]/2,HOME_STAIRS.landingCenter[1]-HOME_STAIRS.landingSize[2]/2],landingMax=[HOME_STAIRS.landingCenter[0]+HOME_STAIRS.landingSize[0]/2,HOME_STAIRS.landingCenter[1]+HOME_STAIRS.landingSize[2]/2];
assert(landingMin[0]<=stairTop.min.x+.01&&landingMax[0]>=stairTop.max.x-.01,'The landing must span the stair width');
assert(Math.abs(landingMax[1]-stairTop.min.z)<.03,'The landing edge must meet the top stair tread without a gap or hidden overlap');
const upperMin=[HOME_STAIRS.upperCenter[0]-HOME_STAIRS.upperSize[0]/2,HOME_STAIRS.upperCenter[1]-HOME_STAIRS.upperSize[2]/2],upperMax=[HOME_STAIRS.upperCenter[0]+HOME_STAIRS.upperSize[0]/2,HOME_STAIRS.upperCenter[1]+HOME_STAIRS.upperSize[2]/2];
assert(Math.min(landingMax[0],upperMax[0])-Math.max(landingMin[0],upperMin[0])>.1&&Math.min(landingMax[1],upperMax[1])-Math.max(landingMin[1],upperMin[1])>.1,'The stair landing must overlap the upper hall on both floor axes');
const backPanels=backWallPanels(13,5.65,HOME_UPPER_DOORWAY),doorLeft=HOME_UPPER_DOORWAY.centerX-HOME_UPPER_DOORWAY.width/2,doorRight=HOME_UPPER_DOORWAY.centerX+HOME_UPPER_DOORWAY.width/2,doorTop=HOME_UPPER_DOORWAY.bottomY+HOME_UPPER_DOORWAY.height;
assert(Math.abs(HOME_UPPER_DOORWAY.bottomY-HOME_STAIRS.top)<.002,'The upstairs doorway sill must meet the stair landing surface');
assert(HOME_UPPER_DOORWAY.height>=1.8&&HOME_UPPER_DOORWAY.width>=.8,'The upstairs doorway must clear a standing character');
for(const p of backPanels){
  const x0=p.centerX-p.width/2,x1=p.centerX+p.width/2,y0=p.centerY-p.height/2,y1=p.centerY+p.height/2;
  assert(!(x0<doorRight&&x1>doorLeft&&y0<doorTop&&y1>HOME_UPPER_DOORWAY.bottomY),'A back-wall panel obstructs the stair-to-bedroom doorway');
}
assert(backPanels.some(p=>p.centerX+p.width/2<=doorLeft+.001)&&backPanels.some(p=>p.centerX-p.width/2>=doorRight-.001),'The rear wall must remain intact on both sides of the doorway');
const bedroomBounds={minX:HOME_BEDROOM.centerX-HOME_BEDROOM.width/2,maxX:HOME_BEDROOM.centerX+HOME_BEDROOM.width/2,minZ:HOME_BEDROOM.centerZ-HOME_BEDROOM.depth/2,maxZ:HOME_BEDROOM.centerZ+HOME_BEDROOM.depth/2};
const bedroomFloorTop=HOME_STAIRS.landingY+HOME_STAIRS.landingSize[1]/2;
assert(Math.abs(bedroomFloorTop-HOME_STAIRS.top)<.002,'The bedroom floor must continue from the stair landing datum');
assert(bedroomBounds.minX<=doorLeft&&bedroomBounds.maxX>=doorRight,'The bedroom floor must span the entire stair-to-room doorway');
assert(Math.min(upperMax[0],bedroomBounds.maxX)-Math.max(upperMin[0],bedroomBounds.minX)>.1&&Math.min(upperMax[1],bedroomBounds.maxZ)-Math.max(upperMin[1],bedroomBounds.minZ)>.04,'The stair landing and bedroom floor must form one continuous platform');
const bedAsset=await loadGeometry('client/public/assets/detail/bed.glb'),bedSize=new Box3().setFromObject(bedAsset.scene,true).getSize(new Vector3());
assert(HOME_BEDROOM.bed[0]-bedSize.x/2>=bedroomBounds.minX&&HOME_BEDROOM.bed[0]+bedSize.x/2<=bedroomBounds.maxX,'The imported bedroom bed must fit between the extension walls');
assert(HOME_BEDROOM.bed[2]-bedSize.z/2>=bedroomBounds.minZ&&HOME_BEDROOM.bed[2]+bedSize.z/2<=bedroomBounds.maxZ,'The imported bedroom bed must stay inside the rear room');
assert(FIELD_TRACKS.width<=.25&&FIELD_TRACKS.length<=4.2,'Field tire ruts must remain subtle and short around the car, not stripe the foreground');
assert(Math.hypot(FIELD_TRACKS.center[0]-FIELD.car[0],FIELD_TRACKS.center[1]-FIELD.car[2])<=1.25,'Field tire ruts must stay anchored to the car');
const fieldView=ROOM_VIEWS.abandoned_field,fieldHotspots=DETAIL_ANCHORS.abandoned_field;
const projectFieldLabels=(camera,width,height,wasOverlapping=false)=>{
  const car=fieldHotspots.af_sedan,bag=fieldHotspots.af_backpack;
  const carScreen=new Vector3(car[0],car[1]+.28,car[2]).project(camera);
  const bagScreen=new Vector3(bag[0],bag[1]+.28,bag[2]).project(camera);
  return updateFieldBackpackOrbit({screenDx:Math.abs(carScreen.x-bagScreen.x)*width/2,screenDy:(carScreen.y-bagScreen.y)*height/2,viewportWidth:width},wasOverlapping);
};
let overlapping=false;
for(const [screenDx,screenDy,expected] of [[100,10,true],[240,30,true],[500,100,false],[100,10,true]]){
  const next=updateFieldBackpackOrbit({screenDx,screenDy,viewportWidth:1280},overlapping);
  assert.equal(next.overlapping,expected,'Field backpack label overlap hysteresis must enter, hold, exit and re-enter consistently');
  assert.equal(Math.abs(next.shiftY)>0,expected,'Field backpack label offset must follow overlap state');
  overlapping=next.overlapping;
}
for(const aspect of [390/520,676/715,1280/720,1920/1080]){
  const width=aspect*720,height=720;
  const camera=new PerspectiveCamera(fieldView.fov,aspect,.1,100);
  camera.position.set(...fieldView.at);camera.lookAt(new Vector3(...fieldView.look));camera.updateMatrixWorld();
  const layout=projectFieldLabels(camera,width,height);
  const points=['af_sedan','af_backpack'].map(id=>new Vector3(...fieldHotspots[id]).add(new Vector3(0,.28,0)).project(camera));
  assert(points.every(p=>Math.abs(p.x)<.5&&Math.abs(p.y)<.8),`Field clue labels must stay within the player camera at ${aspect}`);
  const gapY=Math.abs(points[0].y-points[1].y)*height/2+Math.abs(layout.shiftY);
  const horizontalLimit=width<=700?324:384;
  assert(layout.overlapping?gapY>=64:Math.abs(points[0].x-points[1].x)*width/2>=horizontalLimit||Math.abs(points[0].y-points[1].y)*height/2>=56,`Field clue labels overlap at ${aspect}`);
  const adjustedBagY=(1-points[1].y)*height/2+layout.shiftY;
  assert(adjustedBagY>=24&&adjustedBagY<=height-24,`Field backpack label moves outside the viewport at ${aspect}`);
}
const look=new Vector3(...fieldView.look),base=new Vector3(...fieldView.at).sub(look);
for(let angle=-Math.PI;angle<Math.PI;angle+=Math.PI/12)for(const [width,height] of [[390,520],[676,715],[1280,720],[1920,1080]]){
  const aspect=width/height,c=Math.cos(angle),s=Math.sin(angle),camera=new PerspectiveCamera(fieldView.fov,aspect,.1,100);
  const horizontalLimit=width<=700?324:384;
  camera.position.set(look.x+base.x*c+base.z*s,fieldView.at[1],look.z-base.x*s+base.z*c);camera.lookAt(look);camera.updateMatrixWorld();
  const overlap=projectFieldLabels(camera,width,height);
  const car=fieldHotspots.af_sedan,bag=fieldHotspots.af_backpack;
  const points=[new Vector3(car[0],car[1]+.28,car[2]).project(camera),new Vector3(bag[0],bag[1]+.28,bag[2]).project(camera)];
  assert(points.every(p=>Math.abs(p.x)<.98&&Math.abs(p.y)<.98),`Field clue labels leave the view after orbit ${angle} at ${width}x${height}`);
  const adjustedBagY=(1-points[1].y)*height/2+overlap.shiftY,carY=(1-points[0].y)*height/2;
  assert(adjustedBagY>=24&&adjustedBagY<=height-24,`Field backpack label leaves the viewport after orbit ${angle} at ${width}x${height}`);
  if(overlap.overlapping)assert(Math.abs(adjustedBagY-carY)>=63.5,`Field clue labels remain vertically overlapped after orbit ${angle} at ${width}x${height}: ${JSON.stringify({gap:Math.abs(adjustedBagY-carY),shift:overlap.shiftY,dx:Math.abs(points[0].x-points[1].x)*width/2,dy:Math.abs(points[0].y-points[1].y)*height/2})}`);
  else assert(Math.abs(points[0].x-points[1].x)*width/2>=horizontalLimit||Math.abs(points[0].y-points[1].y)*height/2>=56,`Field clue labels overlap after orbit ${angle} at ${width}x${height}`);
}
// The hospital security-panel label runs along the same corridor sight line as
// the theatre column (the operating-theatre clue stacked above the office-door
// travel). Keep it pushed clear of the stack, with hysteresis and viewport
// bounds, and exercise the guard across orbits and portrait/desktop aspects.
const hospitalView=ROOM_VIEWS.hospital,hospitalHotspots=DETAIL_ANCHORS.hospital;
const hospitalLabelPoint=(id)=>new Vector3(...hospitalHotspots[id]).add(new Vector3(0,.28,0));
const projectHospitalSecurityLabels=(camera,width,height,wasOverlapping=false)=>{
  const theatre=hospitalLabelPoint('h4_theatre').project(camera),security=hospitalLabelPoint('h4_security').project(camera);
  return updateHospitalSecurityOrbit({screenDx:Math.abs(theatre.x-security.x)*width/2,screenDy:(theatre.y-security.y)*height/2,viewportWidth:width},wasOverlapping);
};
let securityOverlap=false;
for(const [screenDx,screenDy,expected] of [[60,20,true],[150,60,true],[400,140,false],[60,20,true]]){
  const next=updateHospitalSecurityOrbit({screenDx,screenDy,viewportWidth:1280},securityOverlap);
  assert.equal(next.overlapping,expected,'Hospital security label overlap hysteresis must enter, hold, exit and re-enter consistently');
  assert.equal(Math.abs(next.shiftY)>0,expected,'Hospital security label offset must follow overlap state');
  securityOverlap=next.overlapping;
}
for(const aspect of [390/520,676/715,1280/720,1920/1080]){
  const width=aspect*720,height=720;
  const camera=new PerspectiveCamera(hospitalView.fov,aspect,.1,100);
  camera.position.set(...hospitalView.at);camera.lookAt(new Vector3(...hospitalView.look));camera.updateMatrixWorld();
  const layout=projectHospitalSecurityLabels(camera,width,height);
  const points=['h4_theatre','h4_security'].map(hospitalLabelPoint).map(p=>p.project(camera));
  assert(points.every(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1),`Hospital clue labels must stay within the player camera at ${aspect}`);
  const gapY=Math.abs(points[0].y-points[1].y)*height/2+Math.abs(layout.shiftY);
  const horizontalLimit=width<=700?170:210;
  assert(layout.overlapping?gapY>=95.5:Math.abs(points[0].x-points[1].x)*width/2>=horizontalLimit||Math.abs(points[0].y-points[1].y)*height/2>=84,`Hospital clue labels overlap at ${aspect}`);
  const adjustedSecurityY=(1-points[1].y)*height/2+layout.shiftY;
  assert(adjustedSecurityY>=24&&adjustedSecurityY<=height-24,`Hospital security label moves outside the viewport at ${aspect}`);
}
const hospitalLook=new Vector3(...hospitalView.look),hospitalBase=new Vector3(...hospitalView.at).sub(hospitalLook);
let hospitalBearings=0;
for(let angle=-Math.PI/3;angle<=Math.PI/3+1e-6;angle+=Math.PI/12)for(const [width,height] of [[390,520],[676,715],[1280,720],[1920,1080]]){
  const aspect=width/height,c=Math.cos(angle),s=Math.sin(angle),camera=new PerspectiveCamera(hospitalView.fov,aspect,.1,100);
  camera.position.set(hospitalLook.x+hospitalBase.x*c+hospitalBase.z*s,hospitalView.at[1],hospitalLook.z-hospitalBase.x*s+hospitalBase.z*c);
  camera.lookAt(hospitalLook);camera.updateMatrixWorld();
  const points=['h4_theatre','h4_security'].map(hospitalLabelPoint).map(p=>p.project(camera));
  if(!points.every(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1))continue;
  hospitalBearings++;
  const layout=projectHospitalSecurityLabels(camera,width,height);
  const adjustedSecurityY=(1-points[1].y)*height/2+layout.shiftY;
  assert(adjustedSecurityY>=24&&adjustedSecurityY<=height-24,`Hospital security label leaves the viewport after orbit ${angle} at ${width}x${height}`);
  const horizontalLimit=width<=700?170:210;
  if(layout.overlapping)assert(Math.abs(points[0].y-points[1].y)*height/2+Math.abs(layout.shiftY)>=95.5,`Hospital clue labels remain vertically overlapped after orbit ${angle} at ${width}x${height}: ${JSON.stringify({dy:Math.abs(points[0].y-points[1].y)*height/2,shift:layout.shiftY,dx:Math.abs(points[0].x-points[1].x)*width/2})}`);
  else assert(Math.abs(points[0].x-points[1].x)*width/2>=horizontalLimit||Math.abs(points[0].y-points[1].y)*height/2>=84,`Hospital clue labels overlap after orbit ${angle} at ${width}x${height}`);
}
assert(hospitalBearings>=20,`Hospital label guard must stay exercised by the orbit sweep (${hospitalBearings} bearings on camera)`);
assert.equal(BEDROOM.laptop[1],DESK_TOP);assert.equal(BEDROOM.lamp[1],DESK_TOP);
const source=await fs.readFile('client/src/Scene.jsx','utf8');
assert.equal((source.match(/<BedroomWorkstation paused=/g)??[]).length,2,'Both bedroom kits must share the fan and workstation');
console.log(`${scenes.length} campaign cinematic cues checked; ${projections} full-body projections, capture shots on five aspect ratios, gazebo roof on four, 300 seated frames, hospital label guard on four aspects across ${hospitalBearings} on-camera orbit bearings, shared fan/workstation checked.`);
