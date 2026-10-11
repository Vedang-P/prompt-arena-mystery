import fs from 'node:fs/promises';
import {AnimationMixer,Box3} from 'three';
import {loadGeometry} from './gltf-geometry.mjs';
const cast=Object.fromEntries(['sameer','parth','mother','officer','veer','enakshi','tanush','leader','ramu'].map(id=>[id,'cast/'+id]));
const measurements={};
for(const [character,path] of Object.entries(cast)){
  const {scene,animations}=await loadGeometry('client/public/assets/'+path+'.glb');
  const mixer=new AnimationMixer(scene),poses={};
  const initial=new Box3().setFromObject(scene,true),scale=path.startsWith('cast')?1:1.78/(initial.max.y-initial.min.y);
  const originalY=path.startsWith('cast')?0:-initial.min.y;
  for(const pose of ['idle','sit','walk','holding-right']){
    const clip=animations.find(a=>a.name===pose);if(!clip)continue;
    mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().play();
    let low=Infinity,high=-Infinity;
    for(let i=0;i<=24;i++){
      mixer.setTime(clip.duration*i/25);scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
      const box=new Box3().setFromObject(scene,true);low=Math.min(low,(box.min.y+originalY)*scale);high=Math.max(high,(box.max.y+originalY)*scale);
    }
    poses[pose]={sole:low,height:high};
  }
  measurements[character]=poses;console.log(character,JSON.stringify(poses));
}
await fs.mkdir('.asset-cache',{recursive:true});
await fs.writeFile('.asset-cache/actor-measurements.json',JSON.stringify(measurements,null,2));
