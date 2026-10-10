"""Retain the published telescope assembly and its source-relative placement."""
import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path.cwd();out=root/'client/public/assets/detail'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'.asset-cache/astronomy/31869.glb'))
parts=('049-telescope-pier','050-equatorial-mount','052-refracting-telescope-tube')
keep=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    ancestors=[];p=obj
    while p:ancestors.append(p.name);p=p.parent
    if any(any(n.startswith(part) for n in ancestors) for part in parts):keep.append(obj)
for obj in keep:
    world=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=world
for obj in list(bpy.context.scene.objects):
    if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
points=[o.matrix_world@Vector(v) for o in keep for v in o.bound_box]
lo=[min(v[i] for v in points) for i in range(3)];hi=[max(v[i] for v in points) for i in range(3)]
for o in keep:o.location+=Vector((-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]))
bpy.ops.export_scene.gltf(filepath=str(out/'telescope.glb'),export_format='GLB')
report=json.loads((out/'measurements.json').read_text())
report['telescope']={'size':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],'vertices':sum(len(o.data.vertices)for o in keep),'bytes':(out/'telescope.glb').stat().st_size}
(out/'measurements.json').write_text(json.dumps(report,indent=2))
print('Retained source assembly:',report['telescope'],flush=True)
