"""Convert licensed, downloaded Rocketbox assets; never generate character geometry.

Run Blender --background --python scripts/blender/prepare_rocketbox.py.
Inputs: .asset-cache/rocketbox (original Microsoft files). Output: web GLBs.
Body motion is retargeted from Microsoft's compatible animation collection.
"""
import bpy, os, json, math
from pathlib import Path
from mathutils import Vector, Matrix

BASE = Path.cwd()
SOURCE = BASE / '.asset-cache/rocketbox/Assets'
OUT = BASE / 'client/public/assets/cast'
OUT.mkdir(parents=True, exist_ok=True)
CAST = {'sameer': 'Male_Adult_04', 'parth': 'Male_Adult_12',
        'mother': 'Female_Adult_07', 'officer': 'Police_Male_01'}
metadata = json.loads((OUT / 'measurements.json').read_text()) if (OUT / 'measurements.json').exists() else {}
for character, asset in CAST.items():
    if os.environ.get('CAST_FILTER') and character != os.environ['CAST_FILTER']: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    folder = SOURCE / ('Avatars/Professions' if character=='officer' else 'Avatars/Adults') / asset
    bpy.ops.import_scene.fbx(filepath=str(folder / 'Export' / (asset + '_facial.fbx')))
    arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    arm.animation_data_clear()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for mesh in meshes:
        if mesh.data.shape_keys:
            for key in list(mesh.data.shape_keys.key_blocks)[1:]:
                if not any(s in key.name for s in ['VI_10_aa', 'VI_01_PP', 'EyeBlinkLeft', 'EyeBlinkRight', 'JawOpen']):
                    mesh.shape_key_remove(key)
    for material in bpy.data.materials:
        if not material.node_tree: continue
        nodes = material.node_tree.nodes
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
        bsdf.inputs['Metallic'].default_value = 0
        bsdf.inputs['Roughness'].default_value = .78
        for n in list(nodes):
            if n.type != 'TEX_IMAGE' or not n.image: continue
            name = n.image.filepath.replace('\\', '/').split('/')[-1]
            src = folder / 'Textures' / name
            if not src.exists():
                nodes.remove(n)
                continue
            n.image = bpy.data.images.load(str(src), check_existing=True)
            if '_normal' in name: n.image.colorspace_settings.name = 'Non-Color'
            if max(n.image.size) > 1024:
                ratio = 1024 / max(n.image.size)
                n.image.scale(int(n.image.size[0]*ratio), int(n.image.size[1]*ratio))
            if '_opacity' in name:
                material.surface_render_method = 'DITHERED'
                material.node_tree.links.new(n.outputs['Alpha'], bsdf.inputs['Alpha'])
        bsdf.inputs['Specular IOR Level'].default_value = .25
    # Bake world-space bone transforms onto the target's original rig.
    originals = set(bpy.context.scene.objects)
    clips = []
    for clip, filename in [('idle', 'f_idle_breathe_01' if character == 'mother' else 'm_idle_breathe_01'),
                           ('sit', 'm_sit_chair_breathe_01')]:
        bpy.ops.import_scene.fbx(filepath=str(SOURCE / 'Animations/all_animations_max_motextr_static' / (filename + '.max.fbx')))
        imported = set(bpy.context.scene.objects) - originals
        motion = next(o for o in imported if o.type == 'ARMATURE')
        source_action = motion.animation_data.action
        start, end = [int(v) for v in source_action.frame_range]
        arm.animation_data_clear()
        action = bpy.data.actions.new(clip)
        arm.animation_data_create()
        arm.animation_data.action = action
        for frame in list(range(start, end+1, 4)) + [end]:
            bpy.context.scene.frame_set(frame)
            for pb in arm.pose.bones:
                source_bone = motion.pose.bones.get(pb.name)
                if not source_bone: continue
                pb.matrix = arm.matrix_world.inverted() @ motion.matrix_world @ source_bone.matrix
                bpy.context.view_layer.update()
                pb.rotation_mode = 'QUATERNION'
                pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
                pb.keyframe_insert('scale', frame=frame)
        clips.append(action)
        for obj in imported: bpy.data.objects.remove(obj, do_unlink=True)
    arm.animation_data.action = clips[0]
    arm.animation_data.action_slot = clips[0].slots[0]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    def bounds():
        deps = bpy.context.evaluated_depsgraph_get()
        points=[]
        for obj in meshes:
            evaluated=obj.evaluated_get(deps)
            points += [evaluated.matrix_world @ Vector(v) for v in evaluated.bound_box]
        return [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]
    low, high = bounds()
    factor = 1.78 / (high[2]-low[2])
    root = bpy.data.objects.new(character, None)
    bpy.context.scene.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    root.scale = (factor, factor, factor)
    root.location = (-((low[0]+high[0])/2)*factor, -((low[1]+high[1])/2)*factor, -low[2]*factor)
    bpy.context.view_layer.update()
    standing_head = arm.matrix_world @ arm.pose.bones['Bip01 Head'].head
    arm.animation_data.action = clips[1]
    arm.animation_data.action_slot = clips[1].slots[0]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    pelvis = arm.matrix_world @ arm.pose.bones['Bip01 Pelvis'].head
    seated_head = arm.matrix_world @ arm.pose.bones['Bip01 Head'].head
    metadata[character] = {'source': asset, 'standingHead': [round(v,4) for v in standing_head],
                           'seatedHead': [round(v,4) for v in seated_head], 'seatHeight': round(pelvis.z-.09,4)}
    arm.animation_data.action = None
    for action in clips:
        track = arm.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 1, action)
        strip.action_slot = action.slots[0]
    bpy.context.scene.render.fps = 30
    bpy.ops.export_scene.gltf(filepath=str(OUT / (character+'.glb')), export_format='GLB',
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_frame_step=4, export_morph_animation=False, export_image_format='JPEG', export_jpeg_quality=85,
        export_yup=True, export_rest_position_armature=True)
    print('EXPORTED', character, metadata[character], os.path.getsize(OUT / (character+'.glb')))
    bpy.ops.wm.save_as_mainfile(filepath=str(BASE / '.asset-cache' / (character+'.blend')))
with open(OUT / 'measurements.json', 'w') as f: json.dump(metadata, f, indent=2)
