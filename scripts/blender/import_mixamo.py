# Converts Mixamo FBX downloads to game-ready GLB.
#
# Workflow:
#   1. Download characters from mixamo.com (FBX Binary, With Skin, 30fps,
#      keyframe reduction: none). Name them victor.fbx / odette.fbx.
#   2. Drop them in client/public/assets/mixamo/
#   3. Run: npm run import:mixamo
#
# Output: client/public/assets/mixamo/<name>.glb  (scale-normalised to 1.8 m,
# animations kept, named for the game's character ids).

import bpy, os, glob
from mathutils import Vector

BASE = r"C:\Users\vedang\Desktop\Prompt Arena!!!\prompt-arena-mystery"
SRC = os.path.join(BASE, "client", "public", "assets", "mixamo")
OUT = SRC

files = sorted(glob.glob(os.path.join(SRC, "*.fbx")))
if not files:
    print(f"NO FBX FILES FOUND in {SRC}")
    print("DONE")

for fbx in files:
    name = os.path.splitext(os.path.basename(fbx))[0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(
        filepath=fbx,
        global_scale=0.01,
        automatic_bone_orientation=True,
        use_anim=True,
    )

    # measure current height
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for corner in obj.bound_box:
                w = obj.matrix_world @ Vector(corner)
                for i in range(3):
                    mins[i] = min(mins[i], w[i])
                    maxs[i] = max(maxs[i], w[i])
    height = maxs[2] - mins[2]
    target = 1.8
    factor = target / height if height > 0.01 else 1.0

    # scale root objects so the character is human height
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    for obj in roots:
        obj.scale = (obj.scale[0] * factor, obj.scale[1] * factor, obj.scale[2] * factor)
    bpy.context.view_layer.update()

    # drop feet to the floor
    mins = [1e9, 1e9, 1e9]
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for corner in obj.bound_box:
                w = obj.matrix_world @ Vector(corner)
                mins[2] = min(mins[2], w[2])
    for obj in roots:
        obj.location.z -= mins[2] if abs(mins[2]) < 20 else 0

    for action in bpy.data.actions:
        action.name = "idle"

    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.castShadow = True
            obj.receiveShadow = True

    out_path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        export_apply=True,
    )
    print(f"converted {os.path.basename(fbx)} -> {out_path} (scale x{factor:.2f})")

print("DONE")
