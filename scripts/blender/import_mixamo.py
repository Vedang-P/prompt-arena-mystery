# Converts Mixamo FBX downloads to game-ready GLB.
#
# Workflow:
#   1. Download characters from mixamo.com (FBX Binary, With Skin, 30fps,
#      keyframe reduction: none, an Idle animation applied). Name them
#      victor.fbx / odette.fbx.
#   2. Drop them in client/public/assets/mixamo/
#   3. Run: npm run import:mixamo
#
# Output: client/public/assets/mixamo/<name>.glb
# (scale-normalised to 1.8 m, animation renamed to "idle", shadows enabled).

import bpy, os, glob
from mathutils import Vector

BASE = r"C:\Users\vedang\Desktop\Prompt Arena!!!\prompt-arena-mystery"
SRC = os.path.join(BASE, "client", "public", "assets", "mixamo")

files = sorted(glob.glob(os.path.join(SRC, "*.fbx")))
if not files:
    print(f"NO FBX FILES FOUND in {SRC}")

for fbx in files:
    name = os.path.splitext(os.path.basename(fbx))[0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx, automatic_bone_orientation=True, use_anim=True)
    bpy.context.view_layer.update()

    # measure the evaluated (skinned) mesh in world space
    deps = bpy.context.evaluated_depsgraph_get()
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            eval_obj = obj.evaluated_get(deps)
            mesh = eval_obj.to_mesh()
            for v in mesh.vertices:
                w = eval_obj.matrix_world @ v.co
                for i in range(3):
                    mins[i] = min(mins[i], w[i])
                    maxs[i] = max(maxs[i], w[i])
            eval_obj.to_mesh_clear()

    height = maxs[2] - mins[2]
    target = 1.8
    factor = target / height if 0.5 < height < 5 else 1.0

    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    for obj in roots:
        obj.scale = (obj.scale[0] * factor, obj.scale[1] * factor, obj.scale[2] * factor)
    bpy.context.view_layer.update()

    # re-measure and drop feet to the floor
    deps = bpy.context.evaluated_depsgraph_get()
    floor = 1e9
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            eval_obj = obj.evaluated_get(deps)
            mesh = eval_obj.to_mesh()
            for v in mesh.vertices:
                floor = min(floor, (eval_obj.matrix_world @ v.co).z)
            eval_obj.to_mesh_clear()
    for obj in roots:
        obj.location.z -= floor

    for action in bpy.data.actions:
        action.name = "idle"

    out_path = os.path.join(SRC, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        export_apply=True,
    )
    print(f"converted {os.path.basename(fbx)} -> {out_path} (height {height:.2f} m, scale x{factor:.2f})")

print("DONE")
