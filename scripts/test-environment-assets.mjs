import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Box3,Vector3,Raycaster,Mesh} from 'three';
import {loadGeometry} from './gltf-geometry.mjs';
import {DESK_TOP,DESK_SEAT,FIELD,FIELD_BACKGROUND_BUILDING,FIELD_OVERGROWTH,carPoint,DETAIL_ANCHORS} from '../client/src/SceneLayout.js';
import {scatterInstanceMatrix} from '../client/src/InstanceTransform.js';
import {ambienceFor} from '../client/src/MusicCues.js';
const loaded=new Map();let checked=0;
const drawBudgets={metal_office_desk:[2,6898],monitor:[5,15900],keyboard:[3,21300],mouse:[4,1736],office_chair:[8,51164],printer:[5,5556],router:[6,5816],portable_cassette_player:[3,13307],binder_notebook:[2,18077],modular_factory_facade:[6,175014],sedan_detailed:[16,132082],gazebo:[3,12852],tree_background:[3,159447],tree_small_02:[3,469748]};
const detailLodTriangleBudgets=new Map([['modular_factory_facade',100000]]);
const lodTriangleBudgets={tree_background:50000,tree_small_02:250000};
for(const folder of ['detail','cast','cinema'])for(const name of await fs.readdir(`client/public/assets/${folder}`)){
 if(!name.endsWith('.glb'))continue;
 const file=`client/public/assets/${folder}/${name}`,b=await fs.readFile(file);
 assert.equal(b.subarray(0,4).toString(),'glTF',file);assert.equal(b.readUInt32LE(8),b.length,file);
 const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 for(const t of j.textures??[]){const source=t.extensions?.EXT_texture_webp?.source??t.source;assert(j.images?.[source],`${name}: missing image ${source}`);}
 for(const image of j.images??[])assert(j.bufferViews?.[image.bufferView]||image.uri,`${name}: missing image payload`);
 const {scene}=await loadGeometry(file);scene.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(scene,true);assert(bounds.min.toArray().every(Number.isFinite)&&bounds.max.toArray().every(Number.isFinite),`${name}: invalid bounds`);
 if(folder==='detail'){assert(Math.abs(bounds.min.y)<.002,`${name}: floor at ${bounds.min.y}`);const assetName=name.slice(0,-4),budget=drawBudgets[assetName];if(budget){let meshes=0,triangles=0;const materials=new Set();scene.traverse(o=>{if(o.isMesh){meshes++;const p=o.geometry.getAttribute('position');triangles+=o.geometry.index?o.geometry.index.count/3:p.count/3;for(const material of [].concat(o.material))materials.add(material.name);}});assert(meshes<=budget[0],`${name}: ${meshes} meshes exceeds its ${budget[0]} draw-part budget`);const lodBudget=detailLodTriangleBudgets.get(assetName);if(lodBudget)assert(triangles<=lodBudget,`${name}: ${Math.round(triangles)} triangles exceeds its distant-detail LOD budget`);else assert(Math.round(triangles)===budget[1],`${name}: geometry changed (${Math.round(triangles)} triangles; expected ${budget[1]})`);if(assetName==='modular_chainlink_fence')assert([...materials].some(n=>n.includes('wire')),`${name}: joined wire material name was lost`);}loaded.set(assetName,{scene,bounds});}
 if(folder==='cinema'){const assetName=name.slice(0,-4),budget=drawBudgets[assetName];if(budget){let meshes=0,triangles=0;const materialNames=new Set();scene.traverse(o=>{if(o.isMesh){meshes++;const p=o.geometry.getAttribute('position');triangles+=o.geometry.index?o.geometry.index.count/3:p.count/3;for(const material of [].concat(o.material))materialNames.add(material.name);}});assert(meshes<=budget[0],`${name}: ${meshes} meshes exceeds its draw-part budget`);if(lodTriangleBudgets[assetName])assert(triangles<=lodTriangleBudgets[assetName],`${name}: ${Math.round(triangles)} triangles exceeds its LOD budget`);else assert(Math.round(triangles)===budget[1],`${name}: geometry changed (${Math.round(triangles)} triangles; expected ${budget[1]})`);if(assetName.startsWith('tree_'))assert([...materialNames].some(n=>n.includes('leaves')),`${name}: foliage material name lost during join`);}}
 checked++;
}
function surface(asset,x,z,expected,scale=1){
 const {scene,bounds}=loaded.get(asset),center=bounds.getCenter(new Vector3());
 const hit=new Raycaster(new Vector3(x/scale+center.x,20,z/scale+center.z),new Vector3(0,-1,0)).intersectObject(scene,true)[0];
 assert(hit,`${asset}: unsupported placement at ${x},${z}`);
 assert(Math.abs((hit.point.y-bounds.min.y)*scale-expected)<.016,`${asset}: expected support ${expected}, actual ${(hit.point.y-bounds.min.y)*scale}`);
}
surface('metal_office_desk',.43,-.13,DESK_TOP,DESK_TOP/loaded.get('metal_office_desk').bounds.max.y);
surface('metal_office_desk',-.2,.25,.7875);
surface('counter',0,0,1.1275);surface('counter',.9,0,1.1275);
surface('modern_coffee_table_01',0,0,.39);
surface('side_table_01',0,0,.55066);
surface('filing_cabinet',0,0,.7225);
surface('office_chair',0,0,DESK_SEAT,DESK_SEAT/.618);
surface('hospital_bed',0,0,.84);
surface('bed',0,0,.687);
const shelf=loaded.get('wooden_bookshelf_worn');
const shelfHits=new Raycaster(new Vector3(0,3,0),new Vector3(0,-1,0)).intersectObject(shelf.scene,true);
for(const y of [.395,.675,1.285,1.675])assert(shelfHits.some(h=>Math.abs(h.point.y-y)<.025),`No shelf supporting books at ${y}`);
const {scene:car}=loaded.get('sedan_detailed');
const fencePart=loaded.get('modular_chainlink_fence').scene.getObjectByName('modular_chainlink_fence_double');
assert(fencePart,'Missing the authored double-panel fence section');
let fenceMeshes=0;fencePart.traverse(o=>{if(o.isMesh)fenceMeshes++;});
assert.equal(fenceMeshes,2,'Each repeated field fence panel should contain only its two authored meshes');
const seatHits=new Raycaster(new Vector3(FIELD.seat[0],2,FIELD.seat[2]),new Vector3(0,-1,0)).intersectObject(car,true);
assert(seatHits.some(hit=>Math.abs(hit.point.y-FIELD.seat[1])<.01),'Backpack is not placed on the actual car-seat surface');
const tires=car.getObjectByName('107_reused_Sculpted_tyre');
assert(tires,'The merged sedan must retain its measured tire geometry');
for(const [x,z] of [[-1.416,-.81],[-1.416,.81],[1.386,-.81],[1.386,.81]]){
 const hits=new Raycaster(new Vector3(x,1,z),new Vector3(0,-1,0)).intersectObject(tires,true);
 assert(hits.some(hit=>Math.abs(FIELD.car[1]+hit.point.y)<.012),`Sedan tire at ${x},${z} must meet the field surface within 12 mm`);
}
const facade=loaded.get('modular_factory_facade');
const facadeSize=facade.bounds.getSize(new Vector3());
assert(Math.abs(facade.bounds.min.y)<.002,'Distant field building must retain its grounded source pivot');
assert(FIELD_BACKGROUND_BUILDING.position[2]<-20&&Math.abs(FIELD_BACKGROUND_BUILDING.position[2]-FIELD.car[2])>25,'Field building must remain a distant background landmark');
assert(FIELD_BACKGROUND_BUILDING.height<facadeSize.y*.3,'Field building must stay low in the skyline');
assert.deepEqual(DETAIL_ANCHORS.abandoned_field.af_backpack,carPoint([FIELD.seat[0],FIELD.seat[1]+.327,FIELD.seat[2]]));
const grass=loaded.get('grass_medium_01');
assert.equal(FIELD_OVERGROWTH.length,36,'The field needs its authored vegetation ring');
assert.equal(FIELD_OVERGROWTH.filter(p=>p.part==='grass_medium_01_large_a_LOD0').length,24,'Large grass should frame the approach');
assert.equal(FIELD_OVERGROWTH.filter(p=>p.part==='grass_medium_01_tall_a_LOD0').length,12,'Tall tufts should break the even silhouette');
for(const item of FIELD_OVERGROWTH){
 const original=grass.scene.getObjectByName(item.part);assert(original,`Missing field grass variant ${item.part}`);
 const template=original.clone(true);template.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(template),offset=new Vector3(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
 const sample=new Mesh(original.geometry);sample.matrix.copy(scatterInstanceMatrix(item,offset,template.matrixWorld));sample.matrixAutoUpdate=false;sample.updateMatrixWorld(true);
 const placed=new Box3().setFromObject(sample,true);
 assert(Math.abs(placed.min.y-item.position[1])<.002,`${item.part}: instanced grass must remain grounded`);
}
const fieldAmbience=ambienceFor('abandoned_field');
assert.deepEqual(fieldAmbience.map(({file})=>file),['wind-loop.mp3','crickets.mp3'],'The abandoned field needs its licensed wind/cricket bed');
for(const {file} of fieldAmbience){const audio=await fs.readFile(`client/public/assets/audio/ambience/${file}`);assert(audio.length>100_000,`Missing or truncated field ambience: ${file}`);}
assert.equal(ambienceFor('sameer_room'),null,'Outdoor ambience must not leak into indoor rooms');
console.log(`PASS ${checked} GLBs plus field checks: valid assets, measured furniture and car-seat support, four tire-to-terrain contacts, fence and distant building placement, 36 grounded instances, and licensed wind/cricket loops.`);
