"""Preserve the canopy of Poly Haven's CC0 tree while preparing a web LOD."""
import bpy, sys
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path('.asset-cache/polyhaven/tree_small_02/tree_small_02.gltf').resolve()))
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
background='--background-lod' in sys.argv
for o in bpy.context.scene.objects:
 if o.type!='MESH': continue
 bpy.context.view_layer.objects.active=o
 material=o.data.materials[0]
 modifier=o.modifiers.new('Canopy preserving LOD','DECIMATE')
 modifier.ratio=(.06 if background else .22) if 'leaves' in material.name else .35
 bpy.ops.object.modifier_apply(modifier=modifier.name)
 print(material.name,len(o.data.vertices))
for img in bpy.data.images:
 if max(img.size)>1024:
  r=1024/max(img.size);img.scale(int(img.size[0]*r),int(img.size[1]*r))
bpy.ops.export_scene.gltf(filepath=str(Path('.asset-cache/background-tree.glb' if background else '.asset-cache/repaired-tree.glb').resolve()),export_format='GLB',export_image_format='AUTO')
