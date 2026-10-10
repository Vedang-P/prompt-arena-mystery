import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Vector3 } from 'three';
import Actor from './Actor.jsx';
import { RoomEnvironment, RoomLighting } from './Scene.jsx';
import { useSettings } from './Settings.jsx';
import { SceneLoading, WorldBoundary } from './WorldBoundary.jsx';

export const BACKDROPS = {};
const CLOSE = { close_parth: 'parth', close_mother: 'mother', close_officer: 'officer' };
function ShotCamera({ roomId, shot, cast, speaker }) {
  const timer = useRef(0);
  const last = useRef('');
  const focus = CLOSE[shot] ?? (shot === 'portrait' ? speaker : null);
  const person = cast.find((c) => c.character === focus);
  const center = person ? [person.at[0], 1.25, person.at[1]] : [0, 1.05, 0];
  const isWide = shot === 'wide';
  const closeDesk = shot === 'close_desk';
  const look = closeDesk ? [2.2, 0.9, -0.4] : center;
  const desired = new Vector3(...(closeDesk ? [1.0, 1.9, 2.5] : person ? [center[0] + 0.25, 1.65, center[2] + 3.6] : [isWide ? 0.4 : 0, isWide ? 2.6 : 1.8, isWide ? 7.2 : 4.8]));
  const target = new Vector3(...look);
  const animated = new Vector3();
  useFrame(({ camera }, delta) => {
    const key = roomId + shot + focus;
    if (last.current !== key) { last.current = key; timer.current = 0; camera.position.copy(desired); }
    timer.current += Math.min(delta, 0.05);
    animated.copy(desired);
    animated.x += Math.sin(timer.current * 0.12) * 0.22;
    animated.z -= Math.min(timer.current * 0.015, 0.4);
    camera.position.lerp(animated, 1 - Math.exp(-2 * delta));
    camera.lookAt(target);
  });
  return null;
}
function Stars() {
  const positions = useMemo(() => {
    const p = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) { p[i * 3] = Math.sin(i * 72.31) * 35; p[i * 3 + 1] = 6 + ((i * 13) % 20); p[i * 3 + 2] = -10 - ((i * 7) % 32); }
    return p;
  }, []);
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial color="#c6d8f2" size={0.055} sizeAttenuation /></points>;
}
export default function Cinema({ sceneId = 'gazebo', shot = 'wide', cast = [], speaker, ending = false }) {
  const { quality } = useSettings();
  const people = useMemo(() => cast.map((c) => {
    if (sceneId === 'sameer_room' && c.character === 'sameer' && c.pose === 'sit') return { ...c, at: [1.3, -0.6], rot: -Math.PI / 2 };
    if (sceneId === 'police_station' && c.character === 'officer') return { ...c, at: [1.9, -2.35], pose: 'sit', rot: 0 };
    return c;
  }), [cast, sceneId]);
  return <WorldBoundary key={sceneId}><Canvas shadows={quality !== 'low'} dpr={[1, quality === 'high' ? 1.6 : 1]} camera={{ position: [0, 2.6, 7.2], fov: 47 }}>
    <color attach="background" args={['#060b14']} /><fog attach="fog" args={['#060b14', 18, 50]} />
    <Suspense fallback={<SceneLoading />}>
      <RoomLighting roomId={sceneId} quality={quality} /><RoomEnvironment roomId={sceneId} />
      {['gazebo', 'concert', 'abandoned_field', 'workshop'].includes(sceneId) && <Stars />}
      {people.map((c) => <group key={c.character} position={[c.at[0], sceneId === 'gazebo' ? 0.2 : 0, c.at[1]]} rotation={[0, c.rot ?? 0, 0]}>
        <Actor character={c.character} pose={c.pose} speaking={c.character === speaker} />
      </group>)}
      {ending && <pointLight position={[0, 1.2, 0]} intensity={6} color="#ff5828" distance={15} />}
    </Suspense>
    <ShotCamera roomId={sceneId} shot={shot} cast={people} speaker={speaker} />
    {quality !== 'low' && <EffectComposer multisampling={quality === 'high' ? 2 : 0}><Bloom intensity={0.22} luminanceThreshold={0.8} mipmapBlur /><Vignette offset={0.3} darkness={0.4} /></EffectComposer>}
  </Canvas></WorldBoundary>;
}
