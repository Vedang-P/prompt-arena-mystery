import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Box3,Vector3,Raycaster} from 'three';
import {loadGeometry} from './gltf-geometry.mjs';
import {DESK_TOP,DESK_SEAT,FIELD,carPoint,DETAIL_ANCHORS} from '../client/src/SceneLayout.js';
const loaded=new Map();let checked=0;
for(const folder of ['detail','cast'])for(const name of await fs.readdir(`client/public/assets/${folder}`)){
 if(!name.endsWith('.glb'))continue;
 const file=`client/public/assets/${folder}/${name}`,b=await fs.readFile(file);
 assert.equal(b.subarray(0,4).toString(),'glTF',file);assert.equal(b.readUInt32LE(8),b.length,file);
 const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 for(const t of j.textures??[]){const source=t.extensions?.EXT_texture_webp?.source??t.source;assert(j.images?.[source],`${name}: missing image ${source}`);}
 for(const image of j.images??[])assert(j.bufferViews?.[image.bufferView]||image.uri,`${name}: missing image payload`);
 const {scene}=await loadGeometry(file);scene.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(scene,true);assert(bounds.min.toArray().every(Number.isFinite)&&bounds.max.toArray().every(Number.isFinite),`${name}: invalid bounds`);
 if(folder==='detail'){assert(Math.abs(bounds.min.y)<.002,`${name}: floor at ${bounds.min.y}`);loaded.set(name.slice(0,-4),{scene,bounds});}
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
const shelf=loaded.get('wooden_bookshelf_worn');
const shelfHits=new Raycaster(new Vector3(0,3,0),new Vector3(0,-1,0)).intersectObject(shelf.scene,true);
for(const y of [.395,.675,1.285,1.675])assert(shelfHits.some(h=>Math.abs(h.point.y-y)<.025),`No shelf supporting books at ${y}`);
const {scene:car}=loaded.get('sedan_detailed'),seat=car.getObjectByName('Contoured_seat_cushion');assert(seat,'Car seat missing');
assert(Math.abs(new Box3().setFromObject(seat).max.y-FIELD.seat[1])<.01,'Backpack is not placed on the actual car seat');
assert.deepEqual(DETAIL_ANCHORS.abandoned_field.af_backpack,carPoint([-.535,1.05,.408]));
console.log(`PASS ${checked} GLBs: texture references, decoded geometry, grounded origins, measured desk/counter/chair/car-seat contacts.`);
