import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MathUtils, Quaternion, Vector3 } from 'three';
import {createFootContact} from './FootContact.js';
import DemonMask from './DemonMask.jsx';

export const HUMAN_CAST = new Set(['sameer', 'parth', 'mother', 'officer','veer','tanush','leader','enakshi','ramu']);
export default function HumanActor({ character, pose = 'idle', focused = false, paused=false, footLift=0, onMeasure, wearingMask=false,holdingMask=false }) {
  const root = useRef();
  const heldMask=useRef();
  const { scene, animations } = useGLTF(`/assets/cast/${character}.glb`);
  const model = useMemo(() => {
    const copy = clone(scene);
    copy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    return copy;
  }, [scene]);
  const rightHand=useMemo(()=>model.getObjectByName('Bip01_R_Hand')??model.getObjectByName('RightHand'),[model]);
  const { actions } = useAnimations(animations, root);
  const contact=useMemo(()=>createFootContact(model),[model]);
  useEffect(() => {
    const action = actions[pose === 'sit' ? 'sit' : 'idle'];
    action?.reset().fadeIn(.3).play();
    return () => action?.fadeOut(.3);
  }, [actions, pose]);
  // 'lie' rests the rig on its back, head towards -x, so a patient can lie in
  // a bed without a bespoke animation clip.
  useEffect(() => {
    if (pose === 'lie') model.rotation.set(-Math.PI/2, 0, Math.PI/2);
    else model.rotation.set(0, 0, 0);
  }, [model, pose]);
  useEffect(()=>{for(const action of Object.values(actions))action?.setEffectiveTimeScale(paused?0:1);},[actions,paused]);
  useEffect(() => { onMeasure?.(1.78); }, [onMeasure]);
  const at = useMemo(() => new Vector3(), []);
  useFrame(({ camera, clock }, dt) => {
    if (pose !== 'lie') contact(pose==='sit'?footLift:0);
    if(holdingMask&&rightHand&&heldMask.current&&root.current){
      rightHand.updateWorldMatrix(true,false);
      const worldPosition=rightHand.getWorldPosition(new Vector3());
      worldPosition.addScaledVector(camera.position.clone().sub(worldPosition).normalize(),.06);
      root.current.worldToLocal(worldPosition);
      heldMask.current.position.copy(worldPosition);
      root.current.getWorldQuaternion(heldMask.current.quaternion);
      heldMask.current.quaternion.invert();
    }
    if (root.current && focused) {
      root.current.getWorldPosition(at);
      const yaw = Math.atan2(camera.position.x-at.x, camera.position.z-at.z);
      root.current.rotation.y = MathUtils.damp(root.current.rotation.y, yaw, 3, dt);
    }
    const time = clock.elapsedTime + (character.length*.43);
    const blink = Math.pow(Math.max(0, Math.sin(time*1.18)), 80);
    model.traverse((o) => {
      if (!o.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(o.morphTargetDictionary)) {
        const value = name.includes('EyeBlink') ? blink : 0;
        o.morphTargetInfluences[index] = MathUtils.damp(o.morphTargetInfluences[index] ?? 0, value, 22, dt);
      }
    });
  });
  return <group ref={root}><primitive object={model} />{wearingMask ? <DemonMask position={[0,1.42,.3]} scale={.8} /> : null}{holdingMask ? <group ref={heldMask}><DemonMask scale={.55}/></group> : null}</group>;
}
