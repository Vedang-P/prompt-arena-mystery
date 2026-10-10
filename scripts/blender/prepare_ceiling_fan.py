"""Pack Poly Haven's CC0 ceiling fan; preserve the imported geometry and textures."""
import bpy, json
from pathlib import Path
from mathutils import Matrix, Vector
root = Path.cwd()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / '.asset-cache/polyhaven/ceiling_fan/ceiling_fan.gltf'))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale = 1.5 / max(high.x-low.x, high.y-low.y)
origin = Vector(((low.x+high.x)/2, (low.y+high.y)/2, high.z))
for obj in meshes:
    obj.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(-origin) @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    if obj.name == 'ceiling_fan_blades':
        z = sum(v.co.z for v in obj.data.vertices) / len(obj.data.vertices)
        pivot = Vector((0, 0, z))
        obj.data.transform(Matrix.Translation(-pivot))
        obj.location = pivot
for material in bpy.data.materials:
    if material.node_tree:
        bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        # The integrated diffuser is off in the night scene.
        bsdf.inputs['Emission Strength'].default_value = 0
bpy.ops.export_scene.gltf(filepath=str(root / 'client/public/assets/cinema/ceiling_fan.glb'), export_format='GLB', export_image_format='AUTO')
report = {'sourceMin':list(low), 'sourceMax':list(high), 'scale':scale, 'mountedDepth':(high.z-low.z)*scale, 'rotorOrigin':list(next(o for o in meshes if o.name=='ceiling_fan_blades').location)}
(root / '.asset-cache/fan-measurements.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
