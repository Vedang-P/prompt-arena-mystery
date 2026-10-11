import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const assets=['sofa_03','modern_arm_chair_01','modern_coffee_table_01','side_table_01','wooden_bookshelf_worn','metal_office_desk','plastic_monobloc_chair_01','classic_laptop','portable_cassette_player','wall_clock','potted_plant_02','book_encyclopedia_set_01','binder_notebook','cardboard_box_01','modular_chainlink_fence','grass_medium_01','weed_plant_02','rock_09','can_rusted','old_tyre','vintage_electric_kettle','wooden_bowl_01','desk_lamp_arm_01','wheelchair_01','clipboard','CashRegister_01','street_lamp_01','dining_table','modern_ceiling_lamp_01','metal_trash_can','modular_factory_facade'];
const log=[];
async function download(name,file,root){
 const dest=path.join(root,name);await fs.mkdir(path.dirname(dest),{recursive:true});
 try{const bytes=await fs.readFile(dest);if(createHash('md5').update(bytes).digest('hex')===file.md5)return;}catch{}
 const res=await fetch(file.url);if(!res.ok)throw Error(`${name}: ${res.status}`);
 const bytes=Buffer.from(await res.arrayBuffer());if(file.md5&&createHash('md5').update(bytes).digest('hex')!==file.md5)throw Error(`Hash: ${name}`);
 await fs.writeFile(dest,bytes);
}
for(let i=0;i<assets.length;i+=3)await Promise.all(assets.slice(i,i+3).map(async id=>{
 const res=await fetch(`https://api.polyhaven.com/files/${id}`);if(!res.ok)throw Error(`${id}: ${res.status}`);
 const meta=await res.json();const model=meta.gltf['1k'].gltf;const root=`.asset-cache/polyhaven/${id}`;
 await download(`${id}.gltf`,model,root);await Promise.all(Object.entries(model.include).map(([n,f])=>download(n,f,root)));
 log.push({id,source:`https://polyhaven.com/a/${id}`,license:'CC0',files:meta});console.log('Ready',id);
}));
await fs.writeFile('.asset-cache/scene-asset-sources.json',JSON.stringify(log,null,2));
await fs.mkdir('client/public/assets/detail',{recursive:true});
await fs.writeFile('client/public/assets/detail/polyhaven-sources.json',JSON.stringify(log.map(({id,source,license})=>({id,source,license})),null,2));
const fence=await(await fetch('https://api.polyhaven.com/files/modular_chainlink_fence')).json();
await download('fence-alpha.png',fence.wire_opacity['1k'].png,'client/public/assets/detail');
