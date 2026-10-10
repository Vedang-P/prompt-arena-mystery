// Texture/vertex compression only: retain rig, animation, morphs and modular part names.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),cache='.asset-cache/optimized-assets';
await fs.mkdir(cache,{recursive:true});
let manifest={};try{manifest=JSON.parse(await fs.readFile(`${cache}/manifest.json`,'utf8'));}catch{}
let before=0,after=0;
for(const folder of ['detail','cast'])for(const name of await fs.readdir(`client/public/assets/${folder}`)){
 if(!name.endsWith('.glb'))continue;
 const dest=`client/public/assets/${folder}/${name}`,bytes=await fs.readFile(dest),key=`${folder}-${name}`,hash=createHash('sha256').update(bytes).digest('hex');
 if(manifest[key]?.outputHash===hash){before+=manifest[key].inputBytes;after+=bytes.length;continue;}
 const raw=path.join(cache,key),webp=path.join(cache,`webp-${key}`),packed=path.join(cache,`packed-${key}`);
 await fs.writeFile(raw,bytes);
 await run(process.execPath,['node_modules/@gltf-transform/cli/bin/cli.js','webp',raw,webp,'--quality','82']);
 await run(process.execPath,['node_modules/@gltf-transform/cli/bin/cli.js','meshopt',webp,packed,'--level','medium']);
 const result=await fs.readFile(packed);await fs.writeFile(dest,result);
 manifest[key]={inputBytes:bytes.length,outputBytes:result.length,outputHash:createHash('sha256').update(result).digest('hex')};
 await fs.writeFile(`${cache}/manifest.json`,JSON.stringify(manifest,null,2));
 before+=bytes.length;after+=result.length;console.log(`${folder}/${name}: ${(bytes.length/1048576).toFixed(2)} → ${(result.length/1048576).toFixed(2)} MiB`);
}
console.log(`Textures and geometry: ${(before/1048576).toFixed(1)} → ${(after/1048576).toFixed(1)} MiB (${Math.round((1-after/before)*100)}% reduction).`);
