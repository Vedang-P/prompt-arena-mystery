import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AnimationMixer,Box3,PerspectiveCamera,Vector3} from 'three';
import {caseData} from '../src/case.js';
import {locationFor,storyCast,placeCast,wideShot,roomWideShot,captureShot,cinematicPhaseFor} from '../client/src/SceneStaging.js';
import {createFootContact} from '../client/src/FootContact.js';
import {PARK,BEDROOM,SAMEER_BED,DETAIL_ANCHORS,HOME_STAIRS,HOME_UPPER_DOORWAY,HOME_BEDROOM,backWallPanels,DESK_TOP,FIELD,FIELD_TRACKS,ROOM_VIEWS,updateFieldBackpackOrbit} from '../client/src/SceneLayout.js';
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
assert.equal(locationFor(act2,'intro',1),'cyber_cafe','The café scene must accompany the café narration');
assert.equal(locationFor(act3,'outro',0),'concert','The capture must begin at the concert service yard');
assert.equal(locationFor(act3,'outro',1),'concert','The departure shot must remain at the concert service yard');
const discoveryCast=placeCast('hospital',storyCast(act4,'outro','hospital',0));
const parthDiscovery=discoveryCast.find(c=>c.character==='parth');
assert(parthDiscovery,'Act 4 discovery must show Parth in the ward');
assert.equal(parthDiscovery.pose,'sit','Parth must be upright and visibly alive during the discovery');
assert(Math.abs(parthDiscovery.y+0.4903-.84002)<.002,'Parth must sit on the measured hospital mattress surface');
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
const captureCast=placeCast('concert',storyCast(act3,'outro','concert'));
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
assert(Math.abs(stairBounds.max.y-HOME_STAIRS.top)<.01,'Upper landing datum must follow the imported stair top');
assert(Math.abs(stairBounds.min.y)<.002,'The stair foot must meet the ground floor');
assert(Math.abs(HOME_STAIRS.landingY+HOME_STAIRS.landingSize[1]/2-HOME_STAIRS.top)<.002,'Landing must meet the stair top without a step or gap');
const stairTop=new Box3();stairAsset.scene.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(v.y>HOME_STAIRS.top-.12)stairTop.expandByPoint(v);}}});
const landingMin=[HOME_STAIRS.landingCenter[0]-HOME_STAIRS.landingSize[0]/2,HOME_STAIRS.landingCenter[1]-HOME_STAIRS.landingSize[2]/2],landingMax=[HOME_STAIRS.landingCenter[0]+HOME_STAIRS.landingSize[0]/2,HOME_STAIRS.landingCenter[1]+HOME_STAIRS.landingSize[2]/2];
assert(landingMin[0]<=stairTop.min.x+.01&&landingMax[0]>=stairTop.max.x-.01&&landingMin[1]<=stairTop.min.z+.01&&landingMax[1]>=stairTop.max.z-.01,'The landing must cover the actual stair top face in world X/Z');
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
assert.equal(BEDROOM.laptop[1],DESK_TOP);assert.equal(BEDROOM.lamp[1],DESK_TOP);
const source=await fs.readFile('client/src/Scene.jsx','utf8');
assert.equal((source.match(/<BedroomWorkstation paused=/g)??[]).length,2,'Both bedroom kits must share the fan and workstation');
console.log(`${scenes.length} campaign cinematic cues checked; ${projections} full-body projections, capture shots on five aspect ratios, gazebo roof on four, 300 seated frames, shared fan/workstation checked.`);
