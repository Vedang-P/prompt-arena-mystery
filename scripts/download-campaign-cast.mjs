import fs from 'node:fs/promises';import path from 'node:path';
await fs.mkdir('.asset-cache',{recursive:true});
let inventory;
try{inventory=JSON.parse(await fs.readFile('.asset-cache/rocketbox-tree.json','utf8'));}
catch{const response=await fetch('https://api.github.com/repos/microsoft/Microsoft-Rocketbox/git/trees/master?recursive=1');if(!response.ok)throw Error(`Rocketbox inventory: ${response.status}`);inventory=await response.json();await fs.writeFile('.asset-cache/rocketbox-tree.json',JSON.stringify(inventory));}
const {tree}=inventory;
const names=['Male_Adult_17','Male_Adult_08','Male_Adult_13','Female_Adult_09','Male_Adult_15'];
const files=tree.filter(x=>x.type==='blob'&&x.path.startsWith('Assets/Avatars/Adults/')&&names.some(n=>x.path.includes('/'+n+'/'))&&(/_facial\.fbx$|_color\.tga$|_normal\.tga$|\.png$/.test(x.path)));
for(let i=0;i<files.length;i+=4)await Promise.all(files.slice(i,i+4).map(async f=>{
 const out=path.join('.asset-cache/rocketbox',f.path);try{await fs.access(out);return;}catch{}
 const r=await fetch('https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/'+f.path);if(!r.ok)throw Error(`${f.path}: ${r.status}`);
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,Buffer.from(await r.arrayBuffer()));console.log(f.path);
}));
