// Load geometry and animation for offline placement checks, without decoding textures.
import fs from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,detail){this.type=type;Object.assign(this,detail);}};
export async function loadGeometry(path) {
  const file=await fs.readFile(path),jsonLength=file.readUInt32LE(12);
  const json=JSON.parse(file.toString('utf8',20,20+jsonLength));
  const binary=file.subarray(28+jsonLength);
  json.materials=(json.materials??[]).map(m=>({name:m.name,doubleSided:true}));
  delete json.images;delete json.textures;delete json.samplers;
  json.extensionsUsed=json.extensionsUsed?.filter(e=>!['EXT_texture_webp','KHR_materials_specular','KHR_materials_unlit','KHR_texture_transform'].includes(e));
  json.extensionsRequired=json.extensionsRequired?.filter(e=>e!=='EXT_texture_webp');
  json.buffers[0].uri='data:application/octet-stream;base64,'+binary.toString('base64');
  return new Promise((resolve,reject)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(JSON.stringify(json),'',resolve,reject));
}
