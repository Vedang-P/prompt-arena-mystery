"""Measure the imported gazebo deck and bench seat in Blender's Z-up coordinates."""
import bpy, json
from pathlib import Path
from collections import defaultdict
root = Path.cwd()
report = {}
for asset in ['gazebo', 'painted_wooden_bench']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root / 'client/public/assets/cinema' / (asset + '.glb')))
    points, levels = [], defaultdict(float)
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH': continue
        points += [obj.matrix_world @ v.co for v in obj.data.vertices]
        for face in obj.data.polygons:
            normal = obj.matrix_world.to_3x3().inverted().transposed() @ face.normal
            if abs(normal.normalized().z) > .98:
                levels[round((obj.matrix_world @ face.center).z, 4)] += face.area
    report[asset] = {'min':[min(p[i] for p in points) for i in range(3)], 'max':[max(p[i] for p in points) for i in range(3)], 'horizontal':sorted(levels.items(),key=lambda row:-row[1])[:12]}
(root / '.asset-cache/park-measurements.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
