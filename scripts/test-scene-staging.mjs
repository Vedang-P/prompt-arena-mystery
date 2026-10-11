import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AnimationMixer,Box3,PerspectiveCamera,Vector3} from 'three';
import {caseData} from '../src/case.js';
import {locationFor,storyCast,placeCast,wideShot,roomWideShot,captureShot} from '../client/src/SceneStaging.js';
import {createFootContact} from '../client/src/FootContact.js';
import {PARK,BEDROOM,HOME_STAIRS,DESK_TOP} from '../client/src/SceneLayout.js';
import {loadGeometry} from './gltf-geometry.mjs';
const scenes=[];
for(const act of caseData.acts){
  for(const beat of act.beats??[])for(const line of beat.lines)scenes.push({room:beat.room,cast:beat.cast,line});
  for(const kind of ['intro','outro'])for(const [index,line] of (act[kind]??[]).entries()){
    const room=locationFor(act,kind,index);scenes.push({room,cast:storyCast(act,kind,room),line});
  }
}
const measurements=JSON.parse(await fs.readFile('.asset-cache/actor-measurements.json','utf8'));
const act2=caseData.acts.find(act=>act.id==='act2'),act3=caseData.acts.find(act=>act.id==='act3');
assert.equal(locationFor(act2,'intro',1),'cyber_cafe','The café scene must accompany the café narration');
assert.equal(locationFor(act3,'outro',0),'concert','The capture must begin at the concert service yard');
assert.equal(locationFor(act3,'outro',1),'concert','The departure shot must remain at the concert service yard');
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
assert.equal(BEDROOM.laptop[1],DESK_TOP);assert.equal(BEDROOM.lamp[1],DESK_TOP);
const source=await fs.readFile('client/src/Scene.jsx','utf8');
assert.equal((source.match(/<BedroomWorkstation paused=/g)??[]).length,2,'Both bedroom kits must share the fan and workstation');
console.log(`${scenes.length} campaign cinematic cues checked; ${projections} full-body projections, capture shots on five aspect ratios, gazebo roof on four, 300 seated frames, shared fan/workstation checked.`);
