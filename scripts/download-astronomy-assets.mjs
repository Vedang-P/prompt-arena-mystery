import fs from 'node:fs/promises';
import path from 'node:path';

// Published, finished CC0 models. The source catalog explicitly records AI provenance.
const sources=JSON.parse(await fs.readFile('client/public/assets/detail/astronomy-sources.json','utf8'));
const aliases={'31852':'eyepiece_case','31862':'star_chart'};
for(const source of sources){
  if(source.license.slug!=='cc0-1.0')throw Error(`Unexpected license: ${source.id}`);
  const file=path.join('.asset-cache/astronomy',`${source.id}.glb`);
  await fs.mkdir(path.dirname(file),{recursive:true});
  let bytes;try{bytes=await fs.readFile(file);}catch{}
  if(!bytes){const response=await fetch(source.url);if(!response.ok)throw Error(`${source.id}: ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());}
  if(bytes.subarray(0,4).toString()!=='glTF'||bytes.readUInt32LE(8)!==bytes.length)throw Error(`Invalid GLB: ${source.id}`);
  await fs.writeFile(file,bytes);
  if(aliases[source.id]){await fs.mkdir('.asset-cache/innerscene',{recursive:true});await fs.writeFile(`.asset-cache/innerscene/${aliases[source.id]}.glb`,bytes);}
  console.log(`Ready ${source.id}`);
}
