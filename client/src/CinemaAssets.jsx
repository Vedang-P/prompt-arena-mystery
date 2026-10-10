import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { Box3, Vector3, RepeatWrapping, SRGBColorSpace } from 'three';

export function ParkGround() {
  const source=useTexture('/assets/cinema/grass.jpg');
  const texture=useMemo(()=>{const t=source.clone();t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(12,12);t.colorSpace=SRGBColorSpace;return t;},[source]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[80,80]}/><meshStandardMaterial map={texture} color="#b9cf9a" roughness={1}/></mesh>;
}

export function CinemaProp({ asset, height, width, position = [0,0,0], rotation = [0,0,0] }) {
  const { scene } = useGLTF(`/assets/cinema/${asset}.glb`);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true;
      if(asset.startsWith('tree_')){
        const prepare=material=>{const m=material.clone();if(m.name.includes('leaves')){m.transparent=false;m.alphaTest=.4;m.depthWrite=true;}return m;};
        o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);
      }
    } });
    const box = new Box3().setFromObject(copy);
    const scale = height ? height / box.getSize(new Vector3()).y : 1;
    return { copy, scale, width:box.getSize(new Vector3()).x, offset: [-(box.max.x+box.min.x)/2, -box.min.y, -(box.max.z+box.min.z)/2] };
  }, [scene,height,asset]);
  useEffect(()=>()=>{if(asset.startsWith('tree_'))model.copy.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))m.dispose();});},[model,asset]);
  return <group position={position} rotation={rotation} scale={[width ? width/model.width : model.scale,model.scale,model.scale]}><primitive object={model.copy} position={model.offset} /></group>;
}

export function WindTree({position,height,rotation=[0,0,0]}){
  const sway=useRef();
  useFrame(({clock})=>{if(sway.current)sway.current.rotation.z=Math.sin(clock.elapsedTime*.42+position[0])*.009;});
  return <group position={position} rotation={rotation}><group ref={sway}><CinemaProp asset="tree_small_02" height={height}/></group></group>;
}
