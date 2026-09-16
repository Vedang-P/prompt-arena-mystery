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
import { EffectComposer, DepthOfField, Vignette, Noise, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

const ASSETS = '/assets';
const F = (name) => `${ASSETS}/furniture/${name}`;
const C = (name) => `${ASSETS}/characters/${name}`;

const CHARACTER_MODELS = {
  victor: C('character-q.glb'), // black suit, red tie
  odette: C('character-n.glb'), // elegant dark-haired woman
};

// Kenney's furniture kit ships at roughly half human scale; these bring each
// piece to believable real-world size (metres).
const SCALE = {
  'chair.glb': 2.0,
  'chairCushion.glb': 2.0,
  'chairDesk.glb': 2.1,
  'desk.glb': 2.0,
  'table.glb': 2.3,
  'tableCloth.glb': 2.3,
  'tableGlass.glb': 2.3,
  'sideTable.glb': 1.9,
  'loungeSofa.glb': 2.0,
  'loungeChair.glb': 2.0,
  'bookcaseClosed.glb': 2.2,
  'bookcaseOpen.glb': 2.2,
  'kitchenBar.glb': 2.6,
  'stoolBar.glb': 2.4,
  'lampRoundFloor.glb': 2.0,
  'lampRoundTable.glb': 1.9,
  'pottedPlant.glb': 2.6,
  'plantSmall1.glb': 2.8,
  'plantSmall2.glb': 2.8,
  'doorway.glb': 2.3,
  'rugRectangle.glb': 1.7,
  'rugRound.glb': 3.4,
  'rugSquare.glb': 2.0,
};

// Colour grading: Kenney's palette is pastel, so each piece is multiplied
// towards the room's oxblood / dark-walnut palette.
const TINT = {
  'chair.glb': '#8a6a4a',
  'chairCushion.glb': '#8a6a4a',
  'chairDesk.glb': '#7a5a3e',
  'desk.glb': '#6b4a33',
  'table.glb': '#7a5a3e',
  'tableCloth.glb': '#6b4a33',
  'tableGlass.glb': '#7a5a3e',
  'sideTable.glb': '#6b4a33',
  'loungeSofa.glb': '#8a4a44',
  'loungeChair.glb': '#8a4a44',
  'bookcaseClosed.glb': '#6b4a33',
  'bookcaseOpen.glb': '#6b4a33',
  'kitchenBar.glb': '#6b4a33',
  'stoolBar.glb': '#7a5a3e',
  'lampRoundFloor.glb': '#c8a878',
  'lampRoundTable.glb': '#c8a878',
  'pottedPlant.glb': '#7a8a5a',
  'plantSmall1.glb': '#7a8a5a',
  'plantSmall2.glb': '#7a8a5a',
  'doorway.glb': '#6b4a33',
  'rugRectangle.glb': '#3f4a56',
  'rugRound.glb': '#7a3a36',
  'rugSquare.glb': '#4a4038',
};

for (const name of Object.keys(SCALE)) useGLTF.preload(F(name));
for (const url of Object.values(CHARACTER_MODELS)) useGLTF.preload(url);

// ---------- primitives ----------

function GLTFModel({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  tint,
  castShadow = true,
  receiveShadow = true,
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const root = scene.clone(true);
    if (tint) {
      const colour = new THREE.Color(tint);
      root.traverse((o) => {
        if (o.isMesh && o.material) {
          const recolor = (mat) => {
            const clone = mat.clone();
            clone.color.multiply(colour);
            return clone;
          };
          o.material = Array.isArray(o.material) ? o.material.map(recolor) : recolor(o.material);
        }
      });
    }
    return root;
  }, [scene, tint]);

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

function Prop({ model, position, rotation = [0, 0, 0] }) {
  return (
    <GLTFModel
      url={F(model)}
      position={position}
      rotation={rotation}
      scale={SCALE[model] ?? 1}
      tint={TINT[model]}
    />
  );
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

function SceneProp({ model, hotspot, found, onClick, offset = [0, 0, 0], labelY }) {
  const [x, y, z] = hotspot.position;
  return (
    <group>
      <Prop model={model} position={[x + offset[0], y + offset[1], z + offset[2]]} />
      <ClueMarker
        hotspot={hotspot}
        found={found}
        onClick={onClick}
        labelY={labelY ?? 1.7}
        pad={[1.6, 2, 1.6]}
      />
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
      <meshStandardMaterial map={diffuse} roughnessMap={rough} color="#b09070" roughness={0.85} />
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
    <group position={position} rotation={rotation} scale={1.12}>
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

      {/* dance circle */}
      <Prop model="rugRound.glb" position={[0, 0.02, 0.4]} />

      {/* west lounge */}
      <Prop model="loungeSofa.glb" position={[-8.0, 0, 1.2]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="loungeChair.glb" position={[-6.7, 0, 0.1]} rotation={[0, 0.4, 0]} />
      <Prop model="loungeChair.glb" position={[-6.7, 0, 2.3]} rotation={[0, -0.4, 0]} />
      <Prop model="sideTable.glb" position={[-7.0, 0, 1.2]} />
      <Prop model="rugRectangle.glb" position={[-6.9, 0.02, 1.2]} />
      <Prop model="lampRoundFloor.glb" position={[-7.7, 0, 3.6]} />

      {/* library wall */}
      <Prop model="bookcaseClosed.glb" position={[-8.5, 0, -1.4]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="bookcaseOpen.glb" position={[-8.5, 0, -3.0]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="desk.glb" position={[-7.4, 0, -3.4]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="chairDesk.glb" position={[-6.5, 0, -3.4]} rotation={[0, -Math.PI / 2, 0]} />

      {/* east bar */}
      <Prop model="kitchenBar.glb" position={[8.3, 0, 1.0]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="kitchenBar.glb" position={[8.3, 0, 2.5]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="stoolBar.glb" position={[7.2, 0, 0.9]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="stoolBar.glb" position={[7.2, 0, 2.0]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="stoolBar.glb" position={[7.2, 0, 3.1]} rotation={[0, Math.PI / 2, 0]} />

      {/* cabaret tables near the floor */}
      <Prop model="table.glb" position={[-0.9, 0, 4.4]} />
      <Prop model="chairCushion.glb" position={[-1.9, 0, 4.7]} rotation={[0, 0.9, 0]} />
      <Prop model="chairCushion.glb" position={[0.1, 0, 4.2]} rotation={[0, -2.2, 0]} />
      <Prop model="table.glb" position={[3.1, 0, 4.5]} />
      <Prop model="chairCushion.glb" position={[2.1, 0, 4.8]} rotation={[0, 0.9, 0]} />
      <Prop model="chairCushion.glb" position={[4.1, 0, 4.3]} rotation={[0, -2.2, 0]} />
      <Prop model="tableCloth.glb" position={[-4.6, 0, 4.2]} />
      <Prop model="chair.glb" position={[-5.6, 0, 4.5]} rotation={[0, 0.9, 0]} />
      <Prop model="chair.glb" position={[-3.6, 0, 4.0]} rotation={[0, -2.2, 0]} />

      {/* greenery */}
      <Prop model="pottedPlant.glb" position={[-8.3, 0, 4.9]} />
      <Prop model="plantSmall1.glb" position={[8.4, 0, -4.6]} />
      <Prop model="plantSmall2.glb" position={[-8.4, 0, -4.6]} />

      {room.hotspots.map((h) =>
        h.type === 'character' ? (
          <Character
            key={h.id}
            url={CHARACTER_MODELS[h.character]}
            label={h.label}
            clip="idle"
            position={h.position}
            rotation={[0, h.character === 'victor' ? 0.5 : -0.5, 0]}
            onClick={() => onCharacter(h)}
          />
        ) : h.clue === 'sheet_music' ? (
          <group key={h.id}>
            <Piano position={h.position} />
            <ClueMarker
              hotspot={h}
              found={state.discovered.includes(h.clue)}
              onClick={() => onClue(h)}
              pad={[2.4, 2, 2]}
              labelY={1.55}
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
      <Prop model="lampRoundFloor.glb" position={[-4.3, 0, -2.9]} />
      <Prop model="pottedPlant.glb" position={[4.4, 0, -3.2]} />
      <Prop model="rugSquare.glb" position={[0, 0.02, -0.6]} />
      <Prop model="loungeChair.glb" position={[-3.6, 0, 1.7]} rotation={[0, 0.9, 0]} />
      <Prop model="tableGlass.glb" position={[-1.9, 0, 2.3]} />
      <Prop model="bookcaseOpen.glb" position={[4.6, 0, 0.8]} rotation={[0, -Math.PI / 2, 0]} />

      {room.hotspots.map((h) =>
        h.type === 'character' ? (
          <Character
            key={h.id}
            url={CHARACTER_MODELS[h.character]}
            label={h.label}
            position={h.position}
            onClick={() => onCharacter(h)}
          />
        ) : h.clue === 'stage_door' ? (
          <SceneProp
            key={h.id}
            model="doorway.glb"
            hotspot={h}
            found={state.discovered.includes(h.clue)}
            onClick={() => onClue(h)}
            offset={[0, 0, -0.75]}
            labelY={2.1}
          />
        ) : (
          <SceneProp
            key={h.id}
            model="sideTable.glb"
            hotspot={h}
            found={state.discovered.includes(h.clue)}
            onClick={() => onClue(h)}
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

function CameraRig({ focus }) {
  const { camera, controls } = useThree();
  const desiredPosition = useRef(new THREE.Vector3(0, 2.3, 7.8));
  const desiredLook = useRef(new THREE.Vector3(0, 1.5, -0.3));
  const transitioning = useRef(false);

  useEffect(() => {
    if (focus) {
      desiredPosition.current.set(focus.position[0] + 0.35, focus.position[1] + 1.62, focus.position[2] + 1.8);
      desiredLook.current.set(focus.position[0], focus.position[1] + 1.42, focus.position[2]);
    } else {
      desiredPosition.current.set(0, 2.3, 7.8);
      desiredLook.current.set(0, 1.5, -0.3);
    }
    transitioning.current = true;
    if (controls) controls.enabled = !focus;
  }, [focus, controls]);

  useFrame((_, delta) => {
    if (!transitioning.current) return;
    const k = 1 - Math.pow(0.0005, Math.min(delta, 0.05));
    camera.position.lerp(desiredPosition.current, k);
    if (controls && controls.enabled) {
      controls.target.lerp(desiredLook.current, k);
      controls.update();
    } else {
      camera.lookAt(desiredLook.current);
    }
    if (camera.position.distanceTo(desiredPosition.current) < 0.03) {
      transitioning.current = false;
      if (controls) {
        controls.target.copy(desiredLook.current);
        if (controls.enabled) controls.update();
      }
    }
  });

  return null;
}

export default function Scene({ state, roomId, focus, onCharacter, onClue }) {
  const room = state.rooms.find((r) => r.id === roomId) ?? state.rooms[0];
  const isBallroom = room.id === 'ballroom';
  const focusTarget = useMemo(
    () =>
      focus
        ? new THREE.Vector3(focus.position[0], focus.position[1] + 1.42, focus.position[2])
        : new THREE.Vector3(0, 1.4, 0),
    [focus]
  );

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
          makeDefault
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
      <CameraRig focus={focus} />
      <EffectComposer>
        <DepthOfField target={focusTarget} focalLength={0.05} bokehScale={6} height={480} />
        <Bloom intensity={0.28} luminanceThreshold={0.72} mipmapBlur />
        <Vignette offset={0.28} darkness={0.62} />
        <Noise opacity={0.035} />
      </EffectComposer>
    </Canvas>
  );
}
