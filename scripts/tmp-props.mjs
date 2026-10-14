import { loadGeometry } from "./gltf-geometry.mjs";
import { Box3, Vector3 } from "three";
const stand = await loadGeometry("client/public/assets/detail/mic_stand.glb");
stand.scene.updateMatrixWorld(true);
const box = new Box3().setFromObject(stand.scene);
const size = box.getSize(new Vector3());
const scale = 1.65 / size.y;
const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
const toProp = v => [ (v[0]-cx)*scale, (v[1]-box.min.y)*scale, (v[2]-cz)*scale ];
const boom = stand.scene.getObjectByName("Adjustable_boom");
const pos = boom.geometry.attributes.position;
let minX = null, maxX = null;
for (let i = 0; i < pos.count; i++) {
  const v = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(boom.matrixWorld);
  if (!minX || v.x < minX.x) minX = v;
  if (!maxX || v.x > maxX.x) maxX = v;
}
const a = toProp(minX.toArray()), b = toProp(maxX.toArray());
console.log("boom end A", a.map(v=>+v.toFixed(3)), "end B", b.map(v=>+v.toFixed(3)));
const dir = new Vector3(b[0]-a[0], b[1]-a[1], b[2]-a[2]).normalize();
console.log("boom dir", dir.toArray().map(v=>+v.toFixed(3)), "angle from +Y (rad)", Math.atan2(dir.x, dir.y).toFixed(3));
// mic centre a little past end B along the boom so the body sits in the clip
const centre = [b[0]+dir.x*.06, b[1]+dir.y*.06, b[2]+dir.z*.06];
console.log("mic prop-space", centre.map(v=>+v.toFixed(3)), "world stage-space", [centre[0], .8+centre[1], .8+centre[2]].map(v=>+v.toFixed(3)));
