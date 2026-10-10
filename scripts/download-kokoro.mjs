import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
const root='.asset-cache/kokoro';await fs.mkdir(root,{recursive:true});
const files={
  'kokoro-v1.0.onnx':'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a',
  'voices-v1.0.bin':'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
};
for(const [name,expected] of Object.entries(files)){
  const path=`${root}/${name}`;
  if(!(await fs.stat(path).catch(()=>null))){
    const r=await fetch(`https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/${name}`);
    if(!r.ok)throw Error(`${name}: ${r.status}`);
    await pipeline(Readable.fromWeb(r.body),createWriteStream(path));
  }
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
  if(hash.digest('hex')!==expected)throw Error(`${name}: checksum differs from pinned official release`);
  console.log(`Verified ${name}`);
}
