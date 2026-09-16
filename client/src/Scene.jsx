import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Html,
  OrbitControls,
  useAnimations,
  useGLTF,
  useTexture,
} from '@react-three/drei';
import * as THREE from 'three';

const ASSETS = '/assets';
const F = (name) => `${ASSETS}/furniture/${name}`;
const C = (name) => `${ASSETS}/characters/${name}`;

const CHARACTER_MODELS = {
  victor: C('character-q.glb'), // black suit, red tie
  odette: C('character-n.glb'), // elegant dark-haired woman
};

const FURNITURE = [
  'bookcaseClosed.glb',
  'bookcaseOpen.glb',
  'loungeSofa.glb',
  'loungeChair.glb',
  'lampRoundFloor.glb',
  'lampRoundTable.glb',
  'kitchenBar.glb',
  'stoolBar.glb',
  'tableCloth.glb',
  'table.glb',
  'tableGlass.glb',
  'chair.glb',
  'chairCushion.glb',
  'chairDesk.glb',
  'desk.glb',
  'sideTable.glb',
  'rugRectangle.glb',
  'rugRound.glb',
  'rugSquare.glb',
  'pottedPlant.glb',
  'plantSmall1.glb',
  'plantSmall2.glb',
  'doorway.glb',
];

for (const name of FURNITURE) useGLTF.preload(F(name));
for (const url of Object.values(CHARACTER_MODELS)) useGLTF.preload(url);

// ---------- primitives ----------

function GLTFModel({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  castShadow = true,
  receiveShadow = true,
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => {
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = castShadow;
        o.receiveShadow = receiveShadow;
      }
    });
  }, [model, castShadow, receiveShadow]);
  return <primitive object={model} position={position} rotation={rotation} scale={scale} />;
}

function Character({ url, label, clip = 'idle', position = [0, 0, 0], rotation = [0, 0, 0], onClick }) {
  const group = useRef();
  const [hover, setHover] = useState(false);
  const { scene, animations } = useGLTF(url);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }, [scene]);

  useEffect(() => {
    const name = names.includes(clip) ? clip : names[0];
    const action = name ? actions[name] : null;
    if (!action) return;
    action.reset().fadeIn(0.4).play();
    return () => action.fadeOut(0.2);
  }, [actions, names, clip]);

  return (
    <group position={position} rotation={rotation}>
      <group ref={group}>
        <primitive object={scene} />
      </group>
      {hover && (
        <pointLight position={[0, 1.9, 0.8]} intensity={1.4} distance={4.5} decay={0} color="#ffd9a0" />
      )}
      <mesh
        position={[0, 1.05, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <cylinderGeometry args={[0.55, 0.55, 2.2, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, 2.45, 0]} center distanceFactor={12} zIndexRange={[30, 0]}>
        <button
          className="hotspot"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {label}
        </button>
      </Html>
    </group>
  );
}

function ClueMarker({ hotspot, found, onClick, pad = [1.7, 2, 1.7], labelY = 1.7 }) {
  const [hover, setHover] = useState(false);
  const [x, y, z] = hotspot.position;
  return (
    <group>
      <Html position={[x, y + labelY, z]} center distanceFactor={12} zIndexRange={[30, 0]}>
        <button
          className={`hotspot ${found ? 'found' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {found ? `${hotspot.label} \u2713` : hotspot.label}
        </button>
      </Html>
      <mesh
        position={[x, 1, z]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={pad} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hover && <pointLight position={[x, 1.7, z + 0.9]} intensity={1.1} distance={4} decay={0} color="#ffe0b0" />}
    </group>
  );
}

function SceneProp({ url, hotspot, found, onClick, scale = 1 }) {
  return (
    <group>
      <GLTFModel url={url} position={hotspot.position} scale={scale} />
      <ClueMarker hotspot={hotspot} found={found} onClick={onClick} />
    </group>
  );
}

// ---------- room shell ----------

function Shell({ width, depth, height, tint }) {
  const plaster = useTexture(`${ASSETS}/env/plaster_diff_1k.jpg`);
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  plaster.repeat.set(5, 2);

  return (
    <group>
      <mesh position={[0, height / 2, -depth / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={plaster} color={tint} roughness={0.95} />
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={plaster} color={tint} roughness={0.95} />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={plaster} color={tint} roughness={0.95} />
      </mesh>
      {[-depth / 2 + 0.04, depth / 2 - 0.04].map((zz) => (
        <mesh key={zz} position={[0, 0.14, zz]}>
          <boxGeometry args={[width, 0.28, 0.09]} />
          <meshStandardMaterial color="#171310" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, height, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#14100d" roughness={1} />
      </mesh>
    </group>
  );
}

function Floor({ width, depth, repeat = [7, 5] }) {
  const [diffuse, rough] = useTexture([
    `${ASSETS}/env/parquet_diff_1k.jpg`,
    `${ASSETS}/env/parquet_rough_1k.jpg`,
  ]);
  for (const tex of [diffuse, rough]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = 8;
  }
  diffuse.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial map={diffuse} roughnessMap={rough} color="#c8a888" roughness={0.85} />
    </mesh>
  );
}

function Stage() {
  return (
    <group position={[0, 0, -4.6]}>
      <mesh receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[10, 0.7, 3]} />
        <meshStandardMaterial color="#2a1a12" roughness={0.75} />
      </mesh>
      <mesh position={[0, 2.6, -1.4]}>
        <planeGeometry args={[10, 4.2]} />
        <meshStandardMaterial color="#4a0f14" roughness={0.9} />
      </mesh>
      {[-4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2].map((x) => (
        <mesh key={x} position={[x, 2.6, -1.28]}>
          <cylinderGeometry args={[0.26, 0.36, 4.2, 12]} />
          <meshStandardMaterial color="#5c1017" roughness={0.85} />
        </mesh>
      ))}
      {[-5.3, 5.3].map((x) => (
        <mesh key={x} position={[x, 2.4, -1.1]}>
          <boxGeometry args={[0.6, 4.8, 0.6]} />
          <meshStandardMaterial color="#2a1a10" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 4.55, -1.1]}>
        <boxGeometry args={[11.2, 0.5, 0.6]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Chandelier({ position }) {
  const candles = [...Array(8)].map((_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    return [Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85];
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 1.5, 6]} />
        <meshStandardMaterial color="#3a2f18" metalness={0.8} roughness={0.5} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.85, 0.045, 10, 40]} />
        <meshStandardMaterial color="#8a6b2f" metalness={0.85} roughness={0.35} />
      </mesh>
      {candles.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.28, 8]} />
            <meshStandardMaterial color="#f2e6c8" />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshStandardMaterial color="#ffdf9a" emissive="#ffb84d" emissiveIntensity={3} />
          </mesh>
        </group>
      ))}
      <pointLight color="#ffd9a0" intensity={2.2} distance={14} decay={0} />
    </group>
  );
}

function Piano({ position, rotation = [0, -1.1, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0, 0.66, 0]}>
        <boxGeometry args={[1.7, 0.22, 1.35]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.35} metalness={0.1} />
      </mesh>
      {[
        [-0.7, -0.5],
        [0.7, -0.5],
        [-0.7, 0.55],
        [0.7, 0.55],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.3, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
          <meshStandardMaterial color="#0c0c10" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.95, -0.45]} rotation-x={-0.28}>
        <boxGeometry args={[1.66, 0.06, 0.7]} />
        <meshStandardMaterial color="#121218" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.8, 0.5]}>
        <boxGeometry args={[1.44, 0.05, 0.2]} />
        <meshStandardMaterial color="#f2ecdf" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.82, -0.15]} rotation-x={-Math.PI / 2.8}>
        <planeGeometry args={[0.5, 0.36]} />
        <meshStandardMaterial
          color="#fff6dd"
          emissive="#ffe9b8"
          emissiveIntensity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ---------- rooms ----------

function Ballroom({ room, state, onCharacter, onClue }) {
  return (
    <group>
      <Shell width={18} depth={12} height={4.9} tint="#6d4a44" />
      <Floor width={18} depth={12} repeat={[7, 5]} />
      <Stage />
      <Chandelier position={[0, 3.5, 1.2]} />

      {/* east wall: bar */}
      <GLTFModel url={F('kitchenBar.glb')} position={[7.2, 0, 2.2]} rotation={[0, -Math.PI / 2, 0]} />
      <GLTFModel url={F('stoolBar.glb')} position={[6.0, 0, 0.9]} rotation={[0, Math.PI / 2, 0]} />
      <GLTFModel url={F('stoolBar.glb')} position={[6.0, 0, 2.2]} rotation={[0, Math.PI / 2, 0]} />
      <GLTFModel url={F('stoolBar.glb')} position={[6.0, 0, 3.5]} rotation={[0, Math.PI / 2, 0]} />

      {/* west wall: library corner */}
      <GLTFModel url={F('bookcaseClosed.glb')} position={[-7.9, 0, -2.6]} rotation={[0, Math.PI / 2, 0]} />
      <GLTFModel url={F('bookcaseOpen.glb')} position={[-7.9, 0, -0.9]} rotation={[0, Math.PI / 2, 0]} />
      <GLTFModel url={F('loungeSofa.glb')} position={[-6.9, 0, 2.4]} rotation={[0, Math.PI / 2, 0]} />
      <GLTFModel url={F('lampRoundFloor.glb')} position={[-6.6, 0, 4.4]} />
      <GLTFModel url={F('desk.glb')} position={[-6.9, 0, 0.7]} rotation={[0, Math.PI / 2, 0]} />
      <GLTFModel url={F('chairDesk.glb')} position={[-5.9, 0, 0.7]} rotation={[0, -Math.PI / 2, 0]} />
      <GLTFModel url={F('rugRectangle.glb')} position={[-6.3, 0.02, 2.2]} scale={1.6} />

      {/* centre: two salon tables */}
      <GLTFModel url={F('tableCloth.glb')} position={[-2.9, 0, 1.4]} />
      <GLTFModel url={F('chair.glb')} position={[-3.9, 0, 2.1]} rotation={[0, 0.7, 0]} />
      <GLTFModel url={F('chairCushion.glb')} position={[-1.9, 0, 2.2]} rotation={[0, -0.8, 0]} />
      <GLTFModel url={F('table.glb')} position={[1.4, 0, 2.9]} />
      <GLTFModel url={F('chairCushion.glb')} position={[0.4, 0, 3.4]} rotation={[0, 0.9, 0]} />
      <GLTFModel url={F('chair.glb')} position={[2.4, 0, 3.2]} rotation={[0, -0.9, 0]} />
      <GLTFModel url={F('rugRound.glb')} position={[0.2, 0.02, 1.8]} scale={1.4} />
      <GLTFModel url={F('lampRoundTable.glb')} position={[-3.0, 0.78, 1.4]} scale={0.7} />

      {/* greenery */}
      <GLTFModel url={F('pottedPlant.glb')} position={[5.9, 0, -4.6]} />
      <GLTFModel url={F('plantSmall1.glb')} position={[-8.2, 0, 4.6]} />
      <GLTFModel url={F('plantSmall2.glb')} position={[8.2, 0, -4.7]} />

      {room.hotspots.map((h) =>
        h.type === 'character' ? (
          <Character
            key={h.id}
            url={CHARACTER_MODELS[h.character]}
            label={h.label}
            clip="idle"
            position={h.position}
            rotation={[0, h.character === 'victor' ? 0.7 : -0.6, 0]}
            onClick={() => onCharacter(h)}
          />
        ) : h.clue === 'sheet_music' ? (
          <group key={h.id}>
            <Piano position={h.position} />
            <ClueMarker
              hotspot={h}
              found={state.discovered.includes(h.clue)}
              onClick={() => onClue(h)}
              pad={[2.2, 2, 1.8]}
              labelY={1.5}
            />
          </group>
        ) : null
      )}
    </group>
  );
}

function Vestibule({ room, state, onCharacter, onClue }) {
  return (
    <group>
      <Shell width={11} depth={9} height={4.2} tint="#47525c" />
      <Floor width={11} depth={9} repeat={[5, 4]} />
      <GLTFModel url={F('lampRoundFloor.glb')} position={[-4.4, 0, -3.2]} />
      <GLTFModel url={F('pottedPlant.glb')} position={[4.5, 0, -3.4]} />
      <GLTFModel url={F('rugSquare.glb')} position={[0, 0.02, -0.8]} scale={1.8} />
      <GLTFModel url={F('loungeChair.glb')} position={[-3.6, 0, 1.6]} rotation={[0, 0.9, 0]} />
      <GLTFModel url={F('tableGlass.glb')} position={[-1.9, 0, 2.2]} />
      <GLTFModel url={F('bookcaseOpen.glb')} position={[4.6, 0, 0.6]} rotation={[0, -Math.PI / 2, 0]} />

      {room.hotspots.map((h) =>
        h.type === 'character' ? (
          <Character
            key={h.id}
            url={CHARACTER_MODELS[h.character]}
            label={h.label}
            position={h.position}
            onClick={() => onCharacter(h)}
          />
        ) : (
          <SceneProp
            key={h.id}
            url={h.clue === 'stage_door' ? F('doorway.glb') : F('sideTable.glb')}
            hotspot={h}
            found={state.discovered.includes(h.clue)}
            onClick={() => onClue(h)}
            scale={h.clue === 'stage_door' ? 1.15 : 1}
          />
        )
      )}
    </group>
  );
}

// ---------- canvas ----------

function EnvironmentIntensity({ value }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.environmentIntensity = value;
  }, [scene, value]);
  return null;
}

export default function Scene({ state, roomId, onCharacter, onClue }) {
  const room = state.rooms.find((r) => r.id === roomId) ?? state.rooms[0];
  const isBallroom = room.id === 'ballroom';

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2.3, 7.8], fov: 46 }}>
      <color attach="background" args={['#080604']} />
      <fog attach="fog" args={['#080604', 15, 36]} />
      <Suspense fallback={null}>
        <Environment files={`${ASSETS}/env/ballroom_2k.hdr`} background={false} />
        <EnvironmentIntensity value={0.42} />
        <ambientLight intensity={0.14} color="#6b6055" />
        <pointLight position={[6.4, 2.3, 2.2]} intensity={1.2} distance={9} decay={0} color="#ffc890" />
        <directionalLight
          position={[5, 9, 6]}
          intensity={0.5}
          color="#9fb0cc"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-camera-far={32}
          shadow-bias={-0.0004}
        />
        <spotLight
          position={[0, 4.6, -2]}
          angle={0.7}
          penumbra={0.9}
          intensity={1.3}
          distance={16}
          decay={0}
          color="#ffd2a0"
        />
        {isBallroom ? (
          <Ballroom room={room} state={state} onCharacter={onCharacter} onClue={onClue} />
        ) : (
          <Vestibule room={room} state={state} onCharacter={onCharacter} onClue={onClue} />
        )}
        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          target={[0, 1.5, -0.3]}
          minDistance={5}
          maxDistance={13}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.15}
          minAzimuthAngle={-1.1}
          maxAzimuthAngle={1.1}
        />
      </Suspense>
    </Canvas>
  );
}
