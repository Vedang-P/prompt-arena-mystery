// Download Poly Haven's CC0 model and its official 1k texture dependencies.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = '.asset-cache/polyhaven/ceiling_fan';
const response = await fetch('https://api.polyhaven.com/files/ceiling_fan', {headers:{'User-Agent':'PromptArena/1.1 asset preparation'}});
if (!response.ok) throw Error(`Asset manifest: ${response.status}`);
const asset = (await response.json()).gltf['1k'].gltf;
for (const [name, file] of [['ceiling_fan.gltf', asset], ...Object.entries(asset.include)]) {
  const result = await fetch(file.url);
  if (!result.ok) throw Error(`${name}: ${result.status}`);
  const destination = path.join(root, name);
  await fs.mkdir(path.dirname(destination), {recursive:true});
  await fs.writeFile(destination, Buffer.from(await result.arrayBuffer()));
  console.log('Downloaded', name);
}
