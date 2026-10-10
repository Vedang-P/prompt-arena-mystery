"""Prepare licensed source geometry; measure, normalize origins, cap texture and mesh costs."""
import bpy, json, os
from pathlib import Path
from mathutils import Vector
root=Path.cwd()
out=root/'client/public/assets/detail'
out.mkdir(parents=True,exist_ok=True)
report=json.loads((out/'measurements.json').read_text()) if (out/'measurements.json').exists() else {}
sources=list((root/'.asset-cache/polyhaven').glob('*/*.gltf'))+list((root/'.asset-cache/innerscene').glob('*.glb'))+list((root/'.asset-cache/innerscene').glob('*.stl'))
for source in sources:
    name=source.stem
    if os.environ.get('DETAIL_FILTER') and name not in os.environ['DETAIL_FILTER'].split(','):continue
    if name in ['tree_small_02','painted_wooden_bench','ceiling_fan','street_lamp_02']: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if source.suffix=='.stl':
        # STEP/StL source axes are Z up; the CAD is authored in millimetres.
        bpy.ops.wm.stl_import(filepath=str(source))
        for obj in bpy.context.scene.objects: obj.scale=(.001,.001,.001)
        mat=bpy.data.materials.new('Stair painted metal');mat.diffuse_color=(.3,.24,.18,1);mat.use_nodes=True
        mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.7
        mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.3,.24,.18,1)
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH':obj.data.materials.append(mat)
        bpy.context.view_layer.update()
    else: bpy.ops.import_scene.gltf(filepath=str(source))
    if name=='backpack_person':
        # Extract the creator's existing backpack only; do not ship the unused person.
        for obj in list(bpy.context.scene.objects):
            if obj.type=='MESH' and any('Backpack' in m.name for m in obj.data.materials):
                world=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=world
                for mod in list(obj.modifiers):obj.modifiers.remove(mod)
            elif obj.type=='MESH':bpy.data.objects.remove(obj,do_unlink=True)
        for obj in list(bpy.context.scene.objects):
            if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
        name='backpack'
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    if not meshes: raise RuntimeError('Empty '+name)
    total_triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    budget={'book_encyclopedia_set_01':3500,'potted_plant_02':6500,'modular_chainlink_fence':20000}.get(name,100000)
    for obj in meshes:
        obj.select_set(True)
        # Large scans retain their silhouette; tiny props need no half-million triangles.
        triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
        ratio=min(1,budget/max(1,total_triangles),65000/max(1,triangles))
        if ratio<1 and triangles>100:
            bpy.context.view_layer.objects.active=obj
            mod=obj.modifiers.new('Web LOD','DECIMATE'); mod.ratio=ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for image in bpy.data.images:
        if image.size[0] and max(image.size)>1024:
            scale=1024/max(image.size);image.scale(max(1,int(image.size[0]*scale)),max(1,int(image.size[1]*scale)))
    points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    lo=[min(v[i] for v in points) for i in range(3)];hi=[max(v[i] for v in points) for i in range(3)]
    parent=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(parent)
    for obj in list(bpy.context.scene.objects):
        if obj!=parent and obj.parent is None:obj.parent=parent
    parent.location=(-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2])
    bpy.context.view_layer.update()
    report[name]={'size':[round(hi[0]-lo[0],5),round(hi[2]-lo[2],5),round(hi[1]-lo[1],5)],'vertices':sum(len(o.data.vertices)for o in meshes)}
    # Blender's WEBP exporter drops dynamically packed ORM sources for these scans.
    # AUTO preserves that generated PNG alongside the original JPEG maps.
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',export_image_format='AUTO',export_keep_originals=False)
    report[name]['bytes']=(out/(name+'.glb')).stat().st_size
    print('PREPARED',name,report[name],flush=True)
(out/'measurements.json').write_text(json.dumps(report,indent=2))
