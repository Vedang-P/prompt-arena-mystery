// Act 0 cinematic stage: primitive-built night scenes, shot-based camera,
// Mixamo actors when available (stand-ins otherwise). No gameplay here.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';

const ACTOR_COLORS = {
  sameer: '#7d3f3a',
  parth: '#3d5a80',
  mother: '#6b4b6e',
  officer: '#4a4436',
};

const BACKDROPS = {
  gazebo: '/assets/pictures/backdrop_gazebo.jpg',
  police_station: '/assets/pictures/backdrop_police.jpg',
  sameer_room: '/assets/pictures/backdrop_room.jpg',
  parth_home: null, // no art for this one yet — uses the primitive room below
};

const SHOTS = {
  gazebo: {
    wide: { pos: [0, 1.62, 5.6], look: [0, 1.28, 0.2] },
    two: { pos: [0, 1.5, 3.6], look: [0, 1.24, 0.1] },
    close_parth: { pos: [0.9, 1.5, 2.5], look: [0.7, 1.4, 0.0] },
  },
  parth_home: {
    wide: { pos: [0, 2.6, 6.6], look: [0, 1.3, 0] },
    two: { pos: [0.2, 2.1, 3.9], look: [0, 1.3, 0.2] },
  },
  police_station: {
    wide: { pos: [0, 1.62, 5.8], look: [0, 1.2, -0.2] },
    two: { pos: [0, 1.5, 3.7], look: [0, 1.18, -0.2] },
    close_officer: { pos: [-1.5, 1.45, 3.0], look: [0.4, 1.1, -0.6] },
    close_mother: { pos: [1.4, 1.5, 3.0], look: [0.2, 1.32, 0.4] },
  },
  sameer_room: {
    wide: { pos: [0, 1.6, 5.4], look: [0, 1.2, 0.2] },
    two: { pos: [0, 1.5, 3.6], look: [0.2, 1.2, 0.3] },
    close_desk: { pos: [-0.4, 1.35, 2.6], look: [0.4, 1.0, 0.3] },
  },
};

function useModelAvailability(ids) {
  const key = ids.join(',');
  const [map, setMap] = useState({});
  useEffect(() => {
    let alive = true;
    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/assets/mixamo/${id}.glb`, { method: 'HEAD' });
          const type = res.headers.get('content-type') || '';
          return [id, res.ok && !type.includes('text/html')];
        } catch {
          return [id, false];
        }
      })
    ).then((entries) => {
      if (alive) setMap(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

function StandIn({ character, pose }) {
  const color = ACTOR_COLORS[character] ?? '#39405c';
  const y = pose === 'sit' ? -0.2 : 0;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.92, 0]} castShadow>
        <capsuleGeometry args={[0.21, 0.78, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.58, 0]} castShadow>
        <sphereGeometry args={[0.155, 18, 18]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

function findBone(root, key) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.isBone && o.name.toLowerCase().includes(key.toLowerCase())) found = o;
  });
  return found;
}

// Raw Mixamo character downloads are T-poses with no action. Rotate the
// shoulders/elbows down to a natural stance, exactly like a pose would.
function relaxPose(root) {
  const targets = [
    ['LeftArm', [0.3, 0.06, -1]],
    ['RightArm', [-0.3, 0.06, -1]],
    ['LeftForeArm', [0.1, -0.4, -1]],
    ['RightForeArm', [-0.1, -0.4, -1]],
  ];
  for (const [name, dir] of targets) {
    const bone = findBone(root, name);
    if (!bone) continue;
    root.updateMatrixWorld(true);
    const m = bone.getWorldQuaternion(new THREE.Quaternion());
    const cur = new THREE.Vector3(0, 1, 0).applyQuaternion(m).normalize();
    if (cur.y < -0.35) continue; // already relaxed (exported bind pose)
    const want = new THREE.Vector3(...dir).normalize();
    const qWorld = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const qLocal = m.clone().invert().multiply(qWorld).multiply(m);
    bone.quaternion.multiply(qLocal);
  }
  root.updateMatrixWorld(true);
}

function ActorModel({ url }) {
  const root = useRef();
  const { scene, animations } = useGLTF(url);
  const { actions, names } = useAnimations(animations, root);

  useEffect(() => {
    if (!names.length) {
      relaxPose(scene);
      return undefined;
    }
    const first = names[0];
    const action = first ? actions[first] : null;
    action?.reset().fadeIn(0.4).play();
    return () => action?.fadeOut(0.2);
  }, [actions, names, scene]);

  const scale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    return h > 0.5 && h < 4 ? 1.78 / h : 1;
  }, [scene]);

  return (
    <group ref={root}>
      <primitive object={scene} scale={scale} />
    </group>
  );
}

function Actor({ id, character, at, rot = 0, pose, available, blob }) {
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, rot, 0]}>
      {blob && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.55, 28]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.38} depthWrite={false} />
        </mesh>
      )}
      {available ? (
        <Suspense fallback={<StandIn character={character} pose={pose} />}>
          <ActorModel url={`/assets/mixamo/${id}.glb`} />
        </Suspense>
      ) : (
        <StandIn character={character} pose={pose} />
      )}
    </group>
  );
}

function ShotCamera({ sceneId, shot }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 1.3, 0));
  const desired = useRef(new THREE.Vector3(0, 2.4, 7));
  const current = SHOTS[sceneId]?.[shot] ?? SHOTS[sceneId]?.wide;

  desired.current.set(...(current?.pos ?? [0, 2.4, 7]));
  target.current.set(...(current?.look ?? [0, 1.3, 0]));

  useFrame((_, delta) => {
    camera.position.lerp(desired.current, 1 - Math.pow(0.002, delta));
    const look = target.current;
    camera.lookAt(look.x, look.y, look.z);
  });
  return null;
}

function Moon({ position = [-6, 7.5, -14], size = 1.6 }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[size, 32, 32]} />
        <meshBasicMaterial color="#dfe8ff" />
      </mesh>
      <pointLight color="#aebdf0" intensity={1.1} distance={40} decay={0} />
    </group>
  );
}

function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 1.4, 7]} />
        <meshStandardMaterial color="#241a12" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <coneGeometry args={[0.85, 1.7, 8]} />
        <meshStandardMaterial color="#16281d" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Gazebo({ cast, available }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#131c14" roughness={1} />
      </mesh>
      <group position={[0, 0, 0.2]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.1, 0]} receiveShadow>
          <cylinderGeometry args={[2.5, 2.5, 0.2, 12]} />
          <meshStandardMaterial color="#3d2f22" roughness={0.9} />
        </mesh>
        {[...Array(6)].map((_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 2.2, 1.6, Math.sin(a) * 2.2]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 3, 8]} />
              <meshStandardMaterial color="#4a3a28" roughness={0.85} />
            </mesh>
          );
        })}
        <mesh position={[0, 3.35, 0]} castShadow>
          <coneGeometry args={[2.8, 1.1, 6]} />
          <meshStandardMaterial color="#2c2118" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.62, 0.9]} rotation={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[1.5, 0.1, 0.45]} />
          <meshStandardMaterial color="#5a4630" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.42, 0.9]} castShadow>
          <boxGeometry args={[1.3, 0.4, 0.12]} />
          <meshStandardMaterial color="#46351f" roughness={0.9} />
        </mesh>
      </group>
      <group position={[3.6, 0, 2.6]}>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.06, 0.09, 3, 8]} />
          <meshStandardMaterial color="#1c1c22" roughness={0.7} />
        </mesh>
        <mesh position={[0, 3.05, 0]}>
          <sphereGeometry args={[0.2, 14, 14]} />
          <meshStandardMaterial color="#ffe6b0" emissive="#ffcf7a" emissiveIntensity={2.4} />
        </mesh>
        <pointLight position={[0, 3, 0]} color="#ffd9a0" intensity={1.6} distance={11} decay={0} />
      </group>
      <Tree position={[-5.4, 0, 1.2]} scale={1.1} />
      <Tree position={[-4.4, 0, -3.4]} scale={0.9} />
      <Tree position={[5.6, 0, -2.6]} scale={1.25} />
      <Tree position={[6.2, 0, 3.4]} scale={0.85} />
      <Moon />
      {cast.map((c) => (
        <Actor key={c.character} id={c.character} {...c} available={available[c.character]} />
      ))}
    </group>
  );
}

function ParthHome({ cast, available }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[12, 9]} />
        <meshStandardMaterial color="#2c2118" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.6, -4.4]} receiveShadow>
        <planeGeometry args={[12, 3.2]} />
        <meshStandardMaterial color="#3a2c22" roughness={0.95} />
      </mesh>
      <mesh position={[-6, 1.6, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[9, 3.2]} />
        <meshStandardMaterial color="#34271e" roughness={0.95} />
      </mesh>
      <mesh position={[6, 1.6, 0]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[9, 3.2]} />
        <meshStandardMaterial color="#34271e" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.5, -4.2]} castShadow>
        <boxGeometry args={[1.6, 1, 0.4]} />
        <meshStandardMaterial color="#4d3a28" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.25, -4.2]} castShadow>
        <boxGeometry args={[1.9, 0.08, 0.5]} />
        <meshStandardMaterial color="#5c4730" roughness={0.85} />
      </mesh>
      <group position={[-4.6, 0, -1.4]}>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.05, 0.08, 1.5, 8]} />
          <meshStandardMaterial color="#1a1a20" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <cylinderGeometry args={[0.34, 0.42, 0.34, 14, 1, true]} />
          <meshStandardMaterial color="#c9995a" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0, 1.45, 0]} color="#ffca82" intensity={1.5} distance={9} decay={0} />
      </group>
      <mesh position={[4.2, 0.24, 1.9]} rotation={[0, -0.5, 0]} castShadow>
        <boxGeometry args={[1.5, 0.48, 0.55]} />
        <meshStandardMaterial color="#413022" roughness={0.9} />
      </mesh>
      {cast.map((c) => (
        <Actor key={c.character} id={c.character} {...c} available={available[c.character]} />
      ))}
    </group>
  );
}

function Fan() {
  const blades = useRef();
  useFrame((_, delta) => {
    if (blades.current) blades.current.rotation.y += delta * 3;
  });
  return (
    <group position={[0, 3.05, 0]}>
      <mesh>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 6]} />
        <meshStandardMaterial color="#20202a" />
      </mesh>
      <group ref={blades} position={[0, -0.3, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation-y={(i / 3) * Math.PI * 2} position={[0.55 * Math.cos((i / 3) * Math.PI * 2), 0, 0.55 * Math.sin((i / 3) * Math.PI * 2)]} rotation-z={0.08}>
            <boxGeometry args={[1.05, 0.02, 0.16]} />
            <meshStandardMaterial color="#26262e" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function PoliceStation({ cast, available }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial color="#22242a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.7, -5]} receiveShadow>
        <planeGeometry args={[14, 3.4]} />
        <meshStandardMaterial color="#2e3038" roughness={0.95} />
      </mesh>
      <mesh position={[-7, 1.7, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[10, 3.4]} />
        <meshStandardMaterial color="#2a2c34" roughness={0.95} />
      </mesh>
      <mesh position={[7, 1.7, 0]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[10, 3.4]} />
        <meshStandardMaterial color="#2a2c34" roughness={0.95} />
      </mesh>
      <mesh position={[0.4, 0.45, -0.9]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.9, 1.1]} />
        <meshStandardMaterial color="#3b3227" roughness={0.9} />
      </mesh>
      <mesh position={[0.4, 0.95, -0.9]} castShadow>
        <boxGeometry args={[3.6, 0.08, 1.25]} />
        <meshStandardMaterial color="#4a3f30" roughness={0.85} />
      </mesh>
      <mesh position={[-0.4, 1.02, -1.15]} castShadow>
        <boxGeometry args={[0.42, 0.14, 0.3]} />
        <meshStandardMaterial color="#e8e2d2" roughness={0.6} />
      </mesh>
      <mesh position={[1.1, 1.02, -0.75]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.35]} />
        <meshStandardMaterial color="#d9d2be" roughness={0.7} />
      </mesh>
      <mesh position={[-4.9, 1.7, -4.9]} rotation={[0, 0.15, 0]}>
        <planeGeometry args={[3, 1.9]} />
        <meshStandardMaterial color="#6d6a56" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.18, -1]}>
        <boxGeometry args={[3.6, 0.06, 0.3]} />
        <meshStandardMaterial color="#f2f4e8" emissive="#eef0dd" emissiveIntensity={0.9} />
      </mesh>
      <pointLight position={[0, 3, 0]} color="#eef0dd" intensity={1.25} distance={12} decay={0} />
      <Fan />
      <mesh position={[3.4, 0.24, 1.6]} castShadow>
        <boxGeometry args={[0.5, 0.48, 0.5]} />
        <meshStandardMaterial color="#33302a" roughness={0.9} />
      </mesh>
      {cast.map((c) => (
        <Actor key={c.character} id={c.character} {...c} available={available[c.character]} />
      ))}
    </group>
  );
}

function SameerRoom({ cast, available }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color="#241d18" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.6, -4]} receiveShadow>
        <planeGeometry args={[10, 3.2]} />
        <meshStandardMaterial color="#2c241d" roughness={0.95} />
      </mesh>
      <mesh position={[-5, 1.6, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[8, 3.2]} />
        <meshStandardMaterial color="#282019" roughness={0.95} />
      </mesh>
      <mesh position={[5, 1.6, 0]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[8, 3.2]} />
        <meshStandardMaterial color="#282019" roughness={0.95} />
      </mesh>
      <mesh position={[-2.4, 0.3, -1.2]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.5, 2.1]} />
        <meshStandardMaterial color="#3a3028" roughness={0.9} />
      </mesh>
      <mesh position={[-2.4, 0.62, -1.95]} castShadow>
        <boxGeometry args={[1.7, 0.16, 0.5]} />
        <meshStandardMaterial color="#4c4034" roughness={0.85} />
      </mesh>
      <mesh position={[1.7, 0.42, -0.6]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.08, 0.9]} />
        <meshStandardMaterial color="#3f3226" roughness={0.85} />
      </mesh>
      <group position={[1.7, 0.46, -0.6]}>
        <mesh position={[0, 0.28, 0.1]} rotation-x={-0.18} castShadow>
          <boxGeometry args={[0.62, 0.42, 0.05]} />
          <meshStandardMaterial color="#15161c" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.28, 0.13]} rotation-x={-0.18}>
          <planeGeometry args={[0.56, 0.36]} />
          <meshStandardMaterial color="#9fd2ff" emissive="#6aa9e8" emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[0, 0.03, 0.28]}>
          <boxGeometry args={[0.6, 0.02, 0.34]} />
          <meshStandardMaterial color="#1b1c22" roughness={0.5} />
        </mesh>
      </group>
      <mesh position={[3.9, 1.85, -3.9]}>
        <planeGeometry args={[2.2, 2]} />
        <meshStandardMaterial color="#0a0f1e" roughness={1} />
      </mesh>
      <group position={[3.9, 1.9, -4.05]}>
        <mesh>
          <circleGeometry args={[0.5, 24]} />
          <meshBasicMaterial color="#dfe8ff" />
        </mesh>
        <pointLight color="#9fb2ea" intensity={0.8} distance={7} decay={0} />
      </group>
      <pointLight position={[1.7, 1.1, -0.2]} color="#ffd28a" intensity={0.9} distance={6} decay={0} />
      {cast.map((c) => (
        <Actor key={c.character} id={c.character} {...c} available={available[c.character]} />
      ))}
    </group>
  );
}

const SCENES = {
  gazebo: Gazebo,
  parth_home: ParthHome,
  police_station: PoliceStation,
  sameer_room: SameerRoom,
};

export default function Cinema({ sceneId, shot, cast = [] }) {
  const SceneComp = SCENES[sceneId] ?? Gazebo;
  const ids = useMemo(() => [...new Set(cast.map((c) => c.character))], [cast]);
  const available = useModelAvailability(ids);
  const bg = BACKDROPS[sceneId];

  if (bg) {
    return (
      <div className="cinema-illustrated">
        <div className="cinema-backdrop" style={{ backgroundImage: `url(${bg})` }} />
        <div className="cinema-backdrop-shade" />
        <Canvas
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 2]}
          camera={{ position: [0, 1.6, 5.6], fov: 38 }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={1.1} color="#cdd7ee" />
          <directionalLight position={[-3, 6, 5]} intensity={1.05} color="#e6ecff" />
          <directionalLight position={[4, 4, -4]} intensity={0.5} color="#7d90c8" />
          <Suspense fallback={null}>
            {cast.map((c) => (
              <Actor key={c.character} id={c.character} {...c} available={available[c.character]} blob />
            ))}
          </Suspense>
          <ShotCamera sceneId={sceneId} shot={shot} />
          <EffectComposer>
            <Bloom intensity={0.35} luminanceThreshold={0.7} mipmapBlur />
            <Vignette offset={0.22} darkness={0.62} />
            <Noise opacity={0.028} />
          </EffectComposer>
        </Canvas>
      </div>
    );
  }

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2.6, 7.4], fov: 42 }}>
      <color attach="background" args={['#05070f']} />
      <fog attach="fog" args={['#05070f', 12, 30]} />
      <ambientLight intensity={0.2} color="#5f6b8a" />
      <directionalLight
        position={[-4, 7, -3]}
        intensity={0.55}
        color="#9fb0dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
      />
      <Suspense fallback={null}>
        <SceneComp cast={cast} available={available} />
      </Suspense>
      <ShotCamera sceneId={sceneId} shot={shot} />
      <EffectComposer>
        <Bloom intensity={0.4} luminanceThreshold={0.68} mipmapBlur />
        <Vignette offset={0.24} darkness={0.68} />
        <Noise opacity={0.03} />
      </EffectComposer>
    </Canvas>
  );
}
