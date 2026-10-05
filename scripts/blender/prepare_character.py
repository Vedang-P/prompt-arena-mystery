"""Prepare a character FBX for the game.

  NAME=parth blender --background --python scripts/blender/prepare_character.py
  NAME=officer ANIM="...\assets\animations\Sitting Laughing.fbx" blender ...

- imports the character (FBX Binary, Mixamo rig)
- retargets ANIM onto it when given (Mixamo animation FBX, same rig);
  characters without an animation stay in bind pose and the client relaxes
  the T-pose at load time (Blender 5 slotted actions make static poses
  unreliable to bake)
- normalises height to 1.78 m, grounds the feet at z=0
- exports GLB with JPEG-in-GLB textures
- renders a verification frame to TMP/char-{NAME}.png
"""

import bpy, os
from mathutils import Vector

BASE = r"C:\Users\vedang\Desktop\Prompt Arena!!!\prompt-arena-mystery"
NAME = os.environ["NAME"]
ANIM = os.environ.get("ANIM", "")
SRC = os.path.join(BASE, "assets", "character models", f"{NAME}.fbx")
OUT = os.path.join(BASE, "client", "public", "assets", "mixamo", f"{NAME}.glb")
TMP = r"C:\Users\vedang\AppData\Local\Temp\opencode"
assert os.path.exists(SRC), f"missing {SRC}"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, automatic_bone_orientation=True, use_anim=True)
bpy.context.view_layer.update()

arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
before = set(bpy.context.scene.objects)

# ---- optional animation retarget ----
if ANIM:
    assert os.path.exists(ANIM), f"missing {ANIM}"
    bpy.ops.import_scene.fbx(filepath=ANIM, use_anim=True)
    bpy.context.view_layer.update()
    anim_arm = next(
        (o for o in bpy.context.scene.objects if o.type == "ARMATURE" and o not in before), None
    )
    action = anim_arm.animation_data.action if anim_arm and anim_arm.animation_data else None
    assert action, "animation file has no action"
    for obj in [o for o in bpy.context.scene.objects if o not in before]:
        bpy.data.objects.remove(obj, do_unlink=True)
    action.name = "idle"
    arm.animation_data_create()
    arm.animation_data.action = action
    if action.slots:
        arm.animation_data.action_slot = action.slots[0]
    print("retargeted", action.name, tuple(action.frame_range))
else:
    # Bake a relaxed stance straight into the exported bind pose (no action):
    # export_rest_position_armature=False below writes the current pose.
    def get_pb(key):
        return next((pb for pb in arm.pose.bones if key.lower() in pb.name.lower()), None)

    def aim_bone(bone_key, target_world):
        pb = get_pb(bone_key)
        if not pb:
            print("missing bone", bone_key, "— examples:", [b.name for b in arm.pose.bones[:6]])
            return
        bpy.context.view_layer.update()
        aw = arm.matrix_world
        MW = aw @ pb.matrix
        cur = ((aw @ pb.tail) - (aw @ pb.head)).normalized()
        rot = cur.rotation_difference(Vector(target_world).normalized())
        new3 = rot.to_matrix() @ MW.to_3x3()
        newMW = new3.to_4x4()
        newMW.translation = MW.translation
        pb.matrix = aw.inverted() @ newMW
        bpy.context.view_layer.update()
        print("posed", pb.name, "->", tuple(round(v, 2) for v in ((aw @ pb.tail) - (aw @ pb.head)).normalized()))

    for side, sign in (("LeftArm", 1), ("RightArm", -1)):
        aim_bone(side, (0.18 * sign, 0.05, -1))
    for side, sign in (("LeftForeArm", 1), ("RightForeArm", -1)):
        aim_bone(side, (0.08 * sign, -0.2, -1))
    bpy.context.view_layer.update()
    print("relaxed stance posed")

# ---- normalise size and ground the feet ----
deps = bpy.context.evaluated_depsgraph_get()
mins = [1e9] * 3
maxs = [-1e9] * 3
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        ev = obj.evaluated_get(deps)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            for i in range(3):
                mins[i] = min(mins[i], w[i])
                maxs[i] = max(maxs[i], w[i])
        ev.to_mesh_clear()

height = maxs[2] - mins[2]
factor = 1.78 / height if 0.5 < height < 5 else 1.0
roots = [o for o in bpy.context.scene.objects if o.parent is None]
for obj in roots:
    obj.scale = (obj.scale[0] * factor, obj.scale[1] * factor, obj.scale[2] * factor)
bpy.context.view_layer.update()

deps = bpy.context.evaluated_depsgraph_get()
floor = 1e9
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        ev = obj.evaluated_get(deps)
        me = ev.to_mesh()
        for v in me.vertices:
            floor = min(floor, (ev.matrix_world @ v.co).z)
        ev.to_mesh_clear()
for obj in roots:
    obj.location.z -= floor
print("height", round(height, 3), "factor", round(factor, 3))

# Textures ship in the GLB; cap them so a character stays under the
# Cloudflare 25 MiB per-asset limit.
for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > 1024:
        s = 1024 / max(w, h)
        img.scale(max(1, int(w * s)), max(1, int(h * s)))
        print("resized texture", img.name, "->", tuple(img.size))

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_animations=bool(ANIM),
    export_animation_mode="ACTIONS",
    export_yup=True,
    export_apply=True,
    export_image_format="JPEG",
    export_rest_position_armature=bool(ANIM),
)
print("exported", OUT, os.path.getsize(OUT) // 1024, "KB")

# ---- verification render: full body, front ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OUT)
bpy.context.view_layer.update()

arm2 = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
has_anim = bool(arm2.animation_data and arm2.animation_data.action)
print("glb action:", arm2.animation_data.action.name if has_anim else "NONE")
if has_anim:
    a2 = arm2.animation_data.action
    f0 = int(a2.frame_range[0])
    bpy.context.scene.frame_set(f0 + (int(a2.frame_range[1]) - f0) // 3)
    pb = arm2.pose.bones.get("mixamorig:LeftArm")
    if pb:
        rest = pb.bone.matrix_local.to_3x3()
        cur = (rest @ Vector((0, 1, 0))).normalized()
        print("left arm world dir:", tuple(round(v, 2) for v in cur))
    else:
        print("no LeftArm bone in glb?")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = 420
scene.render.resolution_y = 720
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.2, 0.2, 0.25, 1)

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.1
cam.location = (0, -4, 0.95)
cam.rotation_euler = (Vector((0, 0, 0.95)) - Vector((0, -4, 0.95))).normalized().to_track_quat("-Z", "Y").to_euler()

light = bpy.data.lights.new("sun", type="SUN")
light.energy = 4
lo = bpy.data.objects.new("sun", light)
lo.rotation_euler = (0.9, 0.25, 0.55)
scene.collection.objects.link(lo)
spot = bpy.data.lights.new("fill", type="SUN")
spot.energy = 1.4
so = bpy.data.objects.new("fill", spot)
so.rotation_euler = (1.2, -0.3, -0.9)
scene.collection.objects.link(so)

scene.render.filepath = os.path.join(TMP, f"char-{NAME}.png")
bpy.ops.render.render(write_still=True)
print("rendered", scene.render.filepath)
print("DONE")
