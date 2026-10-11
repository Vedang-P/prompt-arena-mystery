import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const cli='node_modules/@gltf-transform/cli/bin/cli.js';
const source='.asset-cache/polyhaven/modular_factory_facade/modular_factory_facade.gltf';
const imported='.asset-cache/modular_factory_facade.glb';
const grounded='.asset-cache/modular_factory_facade-grounded.glb';
const output='client/public/assets/detail/modular_factory_facade.glb';

await fs.access(source);
await run(process.execPath,[cli,'copy',source,imported]);
await run(process.execPath,[cli,'center',imported,grounded,'--pivot','below']);
await fs.copyFile(grounded,output);
console.log(`Prepared ${output} from the licensed Poly Haven 1K glTF; pivot centered horizontally and grounded.`);
