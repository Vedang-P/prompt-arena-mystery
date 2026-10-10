import { useEffect, useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { Box3, Vector3, RepeatWrapping, SRGBColorSpace } from 'three';

export function ParkGround() {
  const source=useTexture('/assets/cinema/grass.jpg');
  const texture=useMemo(()=>{const t=source.clone();t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(12,12);t.colorSpace=SRGBColorSpace;return t;},[source]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[60,60]}/><meshStandardMaterial map={texture} color="#9ba083" roughness={1}/></mesh>;
}

export function CinemaProp({ asset, height, width, position = [0,0,0], rotation = [0,0,0] }) {
  const { scene } = useGLTF(`/assets/cinema/${asset}.glb`);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new Box3().setFromObject(copy);
    const scale = height ? height / box.getSize(new Vector3()).y : 1;
    return { copy, scale, width:box.getSize(new Vector3()).x, offset: [-(box.max.x+box.min.x)/2, -box.min.y, -(box.max.z+box.min.z)/2] };
  }, [scene,height]);
  return <group position={position} rotation={rotation} scale={[width ? width/model.width : model.scale,model.scale,model.scale]}><primitive object={model.copy} position={model.offset} /></group>;
}
