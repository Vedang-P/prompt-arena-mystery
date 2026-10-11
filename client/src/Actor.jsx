import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Box3, MathUtils, MeshStandardMaterial, Vector3 } from 'three';
import { actorTexture } from './ActorStyle.js';
import HumanActor, { HUMAN_CAST } from './HumanActor.jsx';

// Complete, bundled, CC0 actors. Each instance owns its animation hierarchy;
// never attach the cached GLTF scene directly to two rooms or two canvases.
export const CAST = {
  sameer: 'a', parth: 'd', mother: 'q', officer: 'b',
  veer: 'j', enakshi: 'p', tanush: 'h', leader: 'm',
  victor: 'h', elise: 'p', ramu: 'r',
};
export const actorURL = (id) => `/assets/characters/character-${CAST[id] ?? 'c'}.glb`;

export default function Actor(props) {
  return HUMAN_CAST.has(props.character) ? <HumanActor {...props} /> : <LegacyActor {...props} />;
}
function LegacyActor({ character, pose = 'idle', speaking = false, focused = false, paused=false, onMeasure }) {
  const root = useRef();
  const { scene, animations } = useGLTF(actorURL(character));
  const model = useMemo(() => {
    const copy = clone(scene);
    copy.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const material = (m) => {
        const mat = new MeshStandardMaterial({ map: actorTexture(character), roughness: 0.82, metalness: 0 });
        return mat;
      };
      o.material = Array.isArray(o.material) ? o.material.map(material) : material(o.material);
    });
    const box = new Box3().setFromObject(copy);
    const size = box.getSize(new Vector3());
    const scale = 1.78 / Math.max(size.y, 0.1);
    return { copy, scale, offset: [-((box.max.x + box.min.x) / 2), -box.min.y, -((box.max.z + box.min.z) / 2)] };
  }, [scene, character]);
  const { actions } = useAnimations(animations, root);
  const clip = pose === 'sit' ? 'sit' : pose === 'walk' ? 'walk' : speaking ? 'holding-right' : 'idle';
  useEffect(() => {
    const action = actions[clip] ?? actions.idle;
    action?.reset().fadeIn(0.25).play();
    return () => { action?.fadeOut(0.25); };
  }, [actions, clip]);
  useEffect(()=>{for(const action of Object.values(actions))action?.setEffectiveTimeScale(paused?0:1);},[actions,paused,clip]);
  useEffect(() => { onMeasure?.(1.78); }, [onMeasure]);
  useFrame((state, dt) => {
    if (!root.current || !focused) return;
    const at = root.current.getWorldPosition(new Vector3());
    const yaw = Math.atan2(state.camera.position.x - at.x, state.camera.position.z - at.z);
    root.current.rotation.y = MathUtils.damp(root.current.rotation.y, yaw, 4, dt);
  });
  useEffect(() => () => {
    model.copy.traverse((o) => {
      if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
  }, [model]);
  return <group ref={root} scale={model.scale}><primitive object={model.copy} position={model.offset} /></group>;
}
