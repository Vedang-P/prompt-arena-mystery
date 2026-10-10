import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AnimationMixer,Box3,PerspectiveCamera,Vector3} from 'three';
import {caseData} from '../src/case.js';
import {locationFor,storyCast,placeCast,wideShot} from '../client/src/SceneStaging.js';
import {createFootContact} from '../client/src/FootContact.js';
import {PARK,BEDROOM,DESK_TOP} from '../client/src/SceneLayout.js';
import {loadGeometry} from './gltf-geometry.mjs';
const scenes=[];
for(const act of caseData.acts){
  for(const beat of act.beats??[])for(const line of beat.lines)scenes.push({room:beat.room,cast:beat.cast,line});
  for(const kind of ['intro','outro'])for(const [index,line] of (act[kind]??[]).entries()){
    const room=locationFor(act,kind,index);scenes.push({room,cast:storyCast(act,kind,room),line});
  }
}
const measurements=JSON.parse(await fs.readFile('.asset-cache/actor-measurements.json','utf8'));
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
assert.equal(BEDROOM.laptop[1],DESK_TOP);assert.equal(BEDROOM.lamp[1],DESK_TOP);
const source=await fs.readFile('client/src/Scene.jsx','utf8');
assert.equal((source.match(/<BedroomWorkstation paused=/g)??[]).length,2,'Both bedroom kits must share the fan and workstation');
console.log(`${scenes.length} campaign cinematic cues checked; ${projections} full-body projections across four aspect ratios, 300 seated animation frames, shared fan/workstation checked.`);
