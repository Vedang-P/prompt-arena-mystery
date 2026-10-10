"""Measure licensed furniture surfaces in Blender coordinates, in metres."""
import bpy, json
from pathlib import Path
from mathutils import Vector
report={}
for path in Path('client/public/assets/furniture').glob('*.glb'):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 points=[o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
 surfaces={}
 for o in meshes:
  for face in o.data.polygons:
   if abs(face.normal.z)<.95: continue
   z=round(sum((o.matrix_world @ o.data.vertices[i].co).z for i in face.vertices)/len(face.vertices),4)
   surfaces[z]=surfaces.get(z,0)+face.area
 report[path.stem]={'min':[round(min(p[i] for p in points),5) for i in range(3)],'max':[round(max(p[i] for p in points),5) for i in range(3)],'horizontal':sorted(surfaces.items(),key=lambda p:-p[1])[:8]}
Path('.asset-cache/furniture-measurements.json').write_text(json.dumps(report,indent=2))
for name in ['desk','chairDesk','bookcaseOpen','lampRoundTable','table','sideTable','chair']:
 print(name,report[name])
