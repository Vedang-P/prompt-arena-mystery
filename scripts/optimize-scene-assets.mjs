// Texture/vertex compression only: retain rig, animation, morphs and modular part names.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),cache='.asset-cache/optimized-assets';
await fs.mkdir(cache,{recursive:true});
let manifest={};try{manifest=JSON.parse(await fs.readFile(`${cache}/manifest.json`,'utf8'));}catch{}
// These detail props are static and are only consumed as complete models. The
// exceptions keep named sub-parts or material names used by scene code intact.
const preserveDetailStructure=new Set(['grass_medium_01','modular_chainlink_fence','sedan']);
const preserveCinemaStructure=new Set(['ceiling_fan']);
const detailLodRatios=new Map([['modular_factory_facade',.55]]);
const cinemaLodRatios=new Map([['tree_background',.25],['tree_small_02',.45]]);
let before=0,after=0;
for(const folder of ['detail','cast','cinema'])for(const name of await fs.readdir(`client/public/assets/${folder}`)){
 if(!name.endsWith('.glb'))continue;
 const dest=`client/public/assets/${folder}/${name}`,bytes=await fs.readFile(dest),key=`${folder}-${name}`,hash=createHash('sha256').update(bytes).digest('hex');
 const assetName=name.slice(0,-4),joinStatic=(folder==='detail'&&!preserveDetailStructure.has(assetName))||(folder==='cinema'&&!preserveCinemaStructure.has(assetName));
 const simplifyRatio=folder==='detail'?detailLodRatios.get(assetName)??null:folder==='cinema'?cinemaLodRatios.get(assetName)??null:null;
 if(manifest[key]?.outputHash===hash&&Boolean(manifest[key]?.joined)===joinStatic&&(manifest[key]?.simplifyRatio??null)===simplifyRatio){before+=manifest[key].inputBytes;after+=bytes.length;continue;}
 const raw=path.join(cache,key),webp=path.join(cache,`webp-${key}`),joined=path.join(cache,`joined-${key}`),simplified=path.join(cache,`simplified-${key}`),packed=path.join(cache,`packed-${key}`);
 // If the current output is already known, start from its preserved original
 // input. This avoids repeatedly applying lossy texture/vertex compression.
 if(manifest[key]?.outputHash!==hash||!await fs.access(raw).then(()=>true,()=>false))await fs.writeFile(raw,bytes);
 await run(process.execPath,['node_modules/@gltf-transform/cli/bin/cli.js','webp',raw,webp,'--quality','82']);
 let geometryInput=webp;
 if(joinStatic){await run(process.execPath,['node_modules/@gltf-transform/cli/bin/cli.js','join',webp,joined,'--keepNamed','false']);geometryInput=joined;}
 if(simplifyRatio!==null){await run(process.execPath,['node_modules/@gltf-transform/cli/bin/cli.js','simplify',geometryInput,simplified,'--ratio',String(simplifyRatio),'--error','0.005']);geometryInput=simplified;}
 await run(process.execPath,['node_modules/@gltf-transform/cli/bin/cli.js','meshopt',geometryInput,packed,'--level','medium']);
 const result=await fs.readFile(packed);await fs.writeFile(dest,result);
 manifest[key]={inputBytes:(await fs.stat(raw)).size,outputBytes:result.length,outputHash:createHash('sha256').update(result).digest('hex'),joined:joinStatic,simplifyRatio};
 await fs.writeFile(`${cache}/manifest.json`,JSON.stringify(manifest,null,2));
 before+=(await fs.stat(raw)).size;after+=result.length;console.log(`${folder}/${name}${joinStatic?' (joined by material)':''}${simplifyRatio!==null?` (LOD ${simplifyRatio})`:''}: ${(bytes.length/1048576).toFixed(2)} → ${(result.length/1048576).toFixed(2)} MiB`);
}
console.log(`Textures and geometry: ${(before/1048576).toFixed(1)} → ${(after/1048576).toFixed(1)} MiB (${Math.round((1-after/before)*100)}% reduction).`);
