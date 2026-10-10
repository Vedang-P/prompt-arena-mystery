"""Pack Poly Haven's CC0 glTF downloads into web-sized GLBs with Blender API."""
import bpy, json
from pathlib import Path
from mathutils import Vector
root = Path.cwd()
out = root / 'client/public/assets/cinema'
report = {}
for asset in ['painted_wooden_bench', 'tree_small_02', 'street_lamp_02']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root / '.asset-cache/polyhaven' / asset / (asset+'.gltf')))
    if asset == 'tree_small_02':
        # Keep material boundaries: merging leaf cards with branches erases the canopy.
        bpy.ops.object.select_all(action='SELECT')
        bpy.context.view_layer.objects.active = next(o for o in bpy.context.scene.objects if o.type=='MESH')
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='MATERIAL')
        bpy.ops.object.mode_set(mode='OBJECT')
        for obj in list(bpy.context.scene.objects):
            if obj.type == 'MESH':
                bpy.context.view_layer.objects.active = obj
                modifier = obj.modifiers.new('Web LOD', 'DECIMATE')
                modifier.ratio = .22 if 'leaves' in obj.data.materials[0].name else .35
                bpy.ops.object.modifier_apply(modifier=modifier.name)
    for img in bpy.data.images:
        if max(img.size) > 1024:
            ratio = 1024/max(img.size)
            img.scale(int(img.size[0]*ratio), int(img.size[1]*ratio))
    points = [o.matrix_world @ Vector(v) for o in bpy.context.scene.objects if o.type=='MESH' for v in o.bound_box]
    report[asset] = {'min': [min(p[i] for p in points) for i in range(3)], 'max': [max(p[i] for p in points) for i in range(3)],
        'vertices':sum(len(o.data.vertices) for o in bpy.context.scene.objects if o.type=='MESH')}
    bpy.ops.export_scene.gltf(filepath=str(out / (asset+'.glb')), export_format='GLB', export_image_format='AUTO')
    print(asset, report[asset])
with open(out / 'environment-measurements.json','w') as f: json.dump(report,f,indent=2)
