import bpy, os
from mathutils import Vector, Quaternion

BASE = r"C:\Users\vedang\Desktop\Prompt Arena!!!\prompt-arena-mystery"
NAME = os.environ.get("NAME", "odette")
SRC = os.path.join(BASE, "client", "public", "assets", "mixamo", f"{NAME}.fbx")
OUT_GLB = os.path.join(BASE, "client", "public", "assets", "mixamo", f"{NAME}.glb")
TMP = r"C:\Users\vedang\AppData\Local\Temp\opencode"

# Bakes a "look at the player" head pitch into the idle clip, then renders the
# face from the game's full-body dialogue camera so the gaze can be checked.
# Calibrated against renders (odette, 2026-09): +X pitches the chin DOWN on
# Mixamo rigs, and the rig's rest head sits slightly chin-up, so -0.25 rad with
# LOCK reads as level eye contact 1.35h away. LOCK replaces the clip's own head
# keys with that one constant pose, killing the idle's stare-at-the-floor phase.
DELTA = float(os.environ.get("HEAD_DELTA", "-0.25"))
TAG = os.environ.get("HEAD_TAG", NAME)
LOCK = os.environ.get("LOCK", "1") == "1"
NS = int(os.environ.get("SAMPLES", "8"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, automatic_bone_orientation=True, use_anim=True)
bpy.context.view_layer.update()

arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
head_name = next(pb.name for pb in arm.pose.bones if "head" in pb.name.lower() and "top" not in pb.name.lower())
action = arm.animation_data.action
print("head bone:", head_name, "action:", action.name, "delta:", DELTA)


def action_fcurves(act):
    legacy = getattr(act, "fcurves", None)
    if legacy is not None and len(legacy):
        return list(legacy)
    curves = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


path = f'pose.bones["{head_name}"].rotation_quaternion'
fcurves = [fc for fc in action_fcurves(action) if fc.data_path == path]
frames = sorted({round(kp.co[0]) for fc in fcurves for kp in fc.keyframe_points})
print("keys:", len(frames), "range:", frames[0], "-", frames[-1])

offset = Quaternion((1, 0, 0), DELTA)
by_index = {fc.array_index: fc for fc in fcurves}
for frame in frames:
    values = {idx: fc.evaluate(frame) for idx, fc in by_index.items()}
    base = Quaternion((values[0], values[1], values[2], values[3]))
    q = offset if LOCK else base @ offset
    for idx in range(4):
        by_index[idx].keyframe_points.insert(frame, q[idx], options={"REPLACE"})
for fc in by_index.values():
    fc.update()

deps = bpy.context.evaluated_depsgraph_get()
mins = [1e9, 1e9, 1e9]
maxs = [-1e9, -1e9, -1e9]
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
factor = 1.8 / height if 0.5 < height < 5 else 1.0
print("pre-scale height:", round(height, 3), "factor:", round(factor, 3))
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

for a in bpy.data.actions:
    a.name = "idle"

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_yup=True,
    export_apply=True,
)
print("exported", OUT_GLB)

# ---- verify from the game's full-body dialogue camera ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OUT_GLB)
bpy.context.view_layer.update()

arm2 = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
act2 = arm2.animation_data.action
f0, f1 = (int(round(v)) for v in act2.frame_range)
print("glb anim frames:", f0, "-", f1)

deps = bpy.context.evaluated_depsgraph_get()
mins = [1e9, 1e9, 1e9]
maxs = [-1e9, -1e9, -1e9]
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and "icosphere" not in obj.name.lower():
        ev = obj.evaluated_get(deps)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            for i in range(3):
                mins[i] = min(mins[i], w[i])
                maxs[i] = max(maxs[i], w[i])
        ev.to_mesh_clear()

height = maxs[2] - mins[2]
center_x = (mins[0] + maxs[0]) / 2
center_y = (mins[1] + maxs[1]) / 2
print("render height", round(height, 3))

cam_pos = Vector((center_x + height * 0.03, center_y - height * 1.35, height * 0.55))
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
cam_data.type = "ORTHO"
cam.location = cam_pos
bpy.context.scene.camera = cam

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 460
scene.render.resolution_y = 460
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.22, 0.22, 0.27, 1)
    bg.inputs[1].default_value = 1.0
light = bpy.data.lights.new("sun", type="SUN")
light.energy = 4
lo = bpy.data.objects.new("sun", light)
lo.rotation_euler = (0.9, 0.2, 0.6)
scene.collection.objects.link(lo)

sample = [f0 + i * (f1 - f0) // NS for i in range(NS)] + [f1]
for i, f in enumerate(sample):
    scene.frame_set(f)
    bpy.context.view_layer.update()
    # tight face framing from the game camera position (aim a touch above mid-body)
    look = Vector((center_x, center_y, height * 0.88))
    cam.rotation_euler = (look - cam_pos).normalized().to_track_quat("-Z", "Y").to_euler()
    cam_data.ortho_scale = height * 0.30
    scene.render.filepath = os.path.join(TMP, f"face-{TAG}-{i}-f{f}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)

print("DONE")
