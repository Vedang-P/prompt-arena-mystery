import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MathUtils, Vector3 } from 'three';
import { speechLevel } from './VoicePlayback.js';
import {createFootContact} from './FootContact.js';

export const HUMAN_CAST = new Set(['sameer', 'parth', 'mother', 'officer','veer','tanush','leader','enakshi','ramu']);
export default function HumanActor({ character, pose = 'idle', focused = false, paused=false, footLift=0, onMeasure }) {
  const root = useRef();
  const { scene, animations } = useGLTF(`/assets/cast/${character}.glb`);
  const model = useMemo(() => {
    const copy = clone(scene);
    copy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    return copy;
  }, [scene]);
  const { actions } = useAnimations(animations, root);
  const contact=useMemo(()=>createFootContact(model),[model]);
  useEffect(() => {
    const action = actions[pose === 'sit' ? 'sit' : 'idle'];
    action?.reset().fadeIn(.3).play();
    return () => action?.fadeOut(.3);
  }, [actions, pose]);
  useEffect(()=>{for(const action of Object.values(actions))action?.setEffectiveTimeScale(paused?0:1);},[actions,paused]);
  useEffect(() => { onMeasure?.(1.78); }, [onMeasure]);
  const at = useMemo(() => new Vector3(), []);
  useFrame(({ camera, clock }, dt) => {
    contact(pose==='sit'?footLift:0);
    if (root.current && focused) {
      root.current.getWorldPosition(at);
      const yaw = Math.atan2(camera.position.x-at.x, camera.position.z-at.z);
      root.current.rotation.y = MathUtils.damp(root.current.rotation.y, yaw, 3, dt);
    }
    const level = speechLevel(character);
    const time = clock.elapsedTime + (character.length*.43);
    const blink = Math.pow(Math.max(0, Math.sin(time*1.18)), 80);
    model.traverse((o) => {
      if (!o.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(o.morphTargetDictionary)) {
        const value = name.includes('VI_10_aa') ? level*.65 : name.includes('JawOpen') ? level*.28 : name.includes('EyeBlink') ? blink : 0;
        o.morphTargetInfluences[index] = MathUtils.damp(o.morphTargetInfluences[index] ?? 0, value, 22, dt);
      }
    });
  });
  return <group ref={root}><primitive object={model} /></group>;
}
