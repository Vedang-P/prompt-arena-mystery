import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const ROOM_STYLE = {
  ballroom: { width: 18, depth: 12, height: 4.8, wall: '#3a1a14', floor: '#160c08', trim: '#0d0705' },
  vestibule: { width: 11, depth: 8, height: 4.2, wall: '#15202a', floor: '#0b1015', trim: '#080c10' },
};

function Shell({ style }) {
  const { width, depth, height, wall, floor, trim } = style;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={floor} roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh position={[0, height / 2, -depth / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      {[-depth / 2 + 0.03, depth / 2 - 0.03].map((z) => (
        <mesh key={z} position={[0, 0.14, z]}>
          <boxGeometry args={[width, 0.28, 0.08]} />
          <meshStandardMaterial color={trim} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Stage() {
  return (
    <group position={[0, 0, -4.4]}>
      <mesh receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[10, 0.7, 3]} />
        <meshStandardMaterial color="#20120c" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.6, -1.4]}>
        <planeGeometry args={[10, 4.2]} />
        <meshStandardMaterial color="#4a0f14" roughness={0.9} />
      </mesh>
      {[-4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2].map((x) => (
        <mesh key={x} position={[x, 2.6, -1.28]}>
          <cylinderGeometry args={[0.26, 0.34, 4.2, 10]} />
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
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.85, 0.045, 10, 40]} />
        <meshStandardMaterial color="#8a6b2f" metalness={0.85} roughness={0.35} />
      </mesh>
      {candles.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.065, 10, 10]} />
          <meshStandardMaterial color="#ffe6b0" emissive="#ffcf88" emissiveIntensity={2.4} />
        </mesh>
      ))}
      <pointLight color="#ffd9a0" intensity={2.4} distance={14} decay={0} />
    </group>
  );
}

function WallLamp({ position }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#ffe6b0" emissive="#ffd9a0" emissiveIntensity={2.2} />
      </mesh>
      <pointLight color="#ffd9a0" intensity={1.5} distance={8} decay={0} />
    </group>
  );
}

function Figure({ hotspot, characterId, onClick }) {
  const sway = useRef();
  const [hover, setHover] = useState(false);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!sway.current) return;
    sway.current.position.y = Math.sin(t * 0.8 + hotspot.position[0]) * 0.018;
    sway.current.rotation.y = Math.sin(t * 0.25 + hotspot.position[2]) * 0.05;
  });
  const isVictor = characterId === 'victor';
  const bodyColor = isVictor ? '#191a20' : '#14332f';
  const over = (e) => {
    e.stopPropagation();
    setHover(true);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    setHover(false);
    document.body.style.cursor = 'auto';
  };
  return (
    <group position={hotspot.position}>
      <group ref={sway}>
        {isVictor ? (
          <>
            <mesh castShadow position={[0, 1.12, 0]}>
              <capsuleGeometry args={[0.3, 0.86, 6, 14]} />
              <meshStandardMaterial color={bodyColor} roughness={0.7} />
            </mesh>
            <mesh position={[0, 1.28, 0.17]}>
              <boxGeometry args={[0.32, 0.5, 0.2]} />
              <meshStandardMaterial color="#efe9dc" roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, 1.98, 0]}>
              <sphereGeometry args={[0.185, 20, 16]} />
              <meshStandardMaterial color="#c9a27a" roughness={0.55} />
            </mesh>
            <mesh castShadow position={[0, 2.13, 0]}>
              <cylinderGeometry args={[0.3, 0.32, 0.08, 20]} />
              <meshStandardMaterial color="#101014" roughness={0.5} />
            </mesh>
            <mesh position={[0, 2.24, 0]}>
              <cylinderGeometry args={[0.19, 0.21, 0.2, 20]} />
              <meshStandardMaterial color="#101014" roughness={0.5} />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow position={[0, 0.72, 0]}>
              <coneGeometry args={[0.46, 1.44, 18]} />
              <meshStandardMaterial color={bodyColor} roughness={0.75} />
            </mesh>
            <mesh castShadow position={[0, 1.62, 0]}>
              <sphereGeometry args={[0.18, 20, 16]} />
              <meshStandardMaterial color="#cfa985" roughness={0.55} />
            </mesh>
            <mesh castShadow position={[0, 1.75, -0.14]}>
              <sphereGeometry args={[0.13, 16, 12]} />
              <meshStandardMaterial color="#2c1b12" roughness={0.7} />
            </mesh>
          </>
        )}
        <mesh
          position={[0, 1.2, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerOver={over}
          onPointerOut={out}
        >
          <cylinderGeometry args={[0.55, 0.55, 2.5, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {hover && <pointLight position={[0, 1.7, 0.7]} intensity={1.1} distance={4} decay={0} color="#ffd9a0" />}
      </group>
      <Html position={[0, 2.75, 0]} center distanceFactor={11} zIndexRange={[30, 0]}>
        <button
          className="hotspot"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {hotspot.label}
        </button>
      </Html>
    </group>
  );
}

function Piano({ position }) {
  return (
    <group position={position} rotation-y={-0.5}>
      <mesh castShadow position={[0, 0.62, 0]}>
        <boxGeometry args={[1.9, 0.22, 0.95]} />
        <meshStandardMaterial color="#0e0e12" roughness={0.45} />
      </mesh>
      {[
        [-0.8, -0.35],
        [0.8, -0.35],
        [-0.8, 0.35],
        [0.8, 0.35],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.28, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.56, 8]} />
          <meshStandardMaterial color="#0e0e12" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.85, -0.32]} rotation-x={-0.35}>
        <boxGeometry args={[1.86, 0.06, 0.5]} />
        <meshStandardMaterial color="#15151b" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.745, 0.42]}>
        <boxGeometry args={[1.5, 0.04, 0.16]} />
        <meshStandardMaterial color="#f2ecdf" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.84, 0.05]} rotation-x={-Math.PI / 2.6}>
        <planeGeometry args={[0.5, 0.36]} />
        <meshStandardMaterial
          color="#fff6dd"
          emissive="#ffe9b8"
          emissiveIntensity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function Door({ position }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 1.25, 0]}>
        <boxGeometry args={[1.3, 2.5, 0.12]} />
        <meshStandardMaterial color="#241610" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.25, 0.08]}>
        <boxGeometry args={[1.02, 2.2, 0.04]} />
        <meshStandardMaterial color="#2e1c13" roughness={0.65} />
      </mesh>
      <mesh position={[0.38, 1.22, 0.12]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

function UmbrellaStand({ position }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.24, 0.26, 0.9, 14]} />
        <meshStandardMaterial color="#1d262b" metalness={0.4} roughness={0.5} />
      </mesh>
      {[-0.12, 0.1].map((x, i) => (
        <mesh key={i} position={[x, 1.1, i * 0.08]} rotation-z={0.12 - i * 0.24}>
          <coneGeometry args={[0.11, 1.3, 10]} />
          <meshStandardMaterial color={i ? '#3a1f2a' : '#22303a'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function ClueProp({ hotspot, found, onClick }) {
  const [hover, setHover] = useState(false);
  const shapes = { sheet_music: Piano, stage_door: Door, ticket_stub: UmbrellaStand };
  const Shape = shapes[hotspot.clue] ?? Piano;
  return (
    <group>
      <Shape position={hotspot.position} />
      <Html
        position={[hotspot.position[0], hotspot.position[1] + 2.2, hotspot.position[2]]}
        center
        distanceFactor={11}
        zIndexRange={[30, 0]}
      >
        <button
          className={`hotspot ${found ? 'found' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {found ? `${hotspot.label} ✓` : hotspot.label}
        </button>
      </Html>
      <mesh
        position={[hotspot.position[0], 1.1, hotspot.position[2]]}
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
        <boxGeometry args={[1.5, 2.1, 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hover && (
        <pointLight
          position={[hotspot.position[0], 1.6, hotspot.position[2] + 0.8]}
          intensity={0.9}
          distance={4}
          decay={0}
          color="#ffe0b0"
        />
      )}
    </group>
  );
}

function Hotspots({ room, state, onCharacter, onClue }) {
  return room.hotspots.map((h) =>
    h.type === 'character' ? (
      <Figure key={h.id} hotspot={h} characterId={h.character} onClick={() => onCharacter(h)} />
    ) : (
      <ClueProp
        key={h.id}
        hotspot={h}
        found={state.discovered.includes(h.clue)}
        onClick={() => onClue(h)}
      />
    )
  );
}

export default function Scene({ state, roomId, onCharacter, onClue }) {
  const room = state.rooms.find((r) => r.id === roomId) ?? state.rooms[0];
  const isBallroom = room.id === 'ballroom';
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2.7, 8.5], fov: 46 }}>
      <color attach="background" args={['#060403']} />
      <fog attach="fog" args={['#060403', 13, 32]} />
      <ambientLight intensity={0.4} color="#7a6a58" />
      <directionalLight
        position={[5, 8, 6]}
        intensity={0.55}
        color="#93a7c9"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={30}
      />
      <Shell style={isBallroom ? ROOM_STYLE.ballroom : ROOM_STYLE.vestibule} />
      {isBallroom ? (
        <>
          <Stage />
          <Chandelier position={[0, 4.1, 1.6]} />
        </>
      ) : (
        <>
          <WallLamp position={[-4.2, 2.9, -3.4]} />
          <WallLamp position={[4.2, 2.9, -3.4]} />
        </>
      )}
      <Hotspots room={room} state={state} onCharacter={onCharacter} onClue={onClue} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        target={[0, 1.5, 0]}
        minDistance={5}
        maxDistance={12}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.15}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
      />
    </Canvas>
  );
}
