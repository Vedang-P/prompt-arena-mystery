import './styles-scene.css';
import { CinemaProp, ParkGround } from './CinemaAssets.jsx';
import Actor, { actorURL } from './Actor.jsx';
import { useSettings } from './Settings.jsx';
import { SceneLoading, WorldBoundary } from './WorldBoundary.jsx';
import { useCallback, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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

const CHARACTER_URL = actorURL;

// Only these Mixamo actors ship in the bundle; any other character hotspot
// falls back to a primitive stand-in so a room never suspends on a 404.
const KNOWN_CHARACTER_MODELS = new Set(['mother', 'officer', 'parth']);

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
  'lampWall.glb': 2.2,
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
  'lampWall.glb': '#c8a878',
  'pottedPlant.glb': '#7a8a5a',
  'plantSmall1.glb': '#7a8a5a',
  'plantSmall2.glb': '#7a8a5a',
  'doorway.glb': '#6b4a33',
  'rugRectangle.glb': '#3f4a56',
  'rugRound.glb': '#7a3a36',
  'rugSquare.glb': '#4a4038',
};

for (const name of Object.keys(SCALE)) useGLTF.preload(F(name));

const DEMO_ROOMS = new Set(['ballroom', 'vestibule']);
const OUTDOOR_ROOMS = new Set(['gazebo', 'abandoned_field', 'concert', 'workshop']);

// Hotspot labels are compact chips so busy rooms stay readable: smaller type,
// a translucent plate, per-index vertical stagger and an inward nudge when the
// anchor sits near the screen edges (labels only — markers never move).
const LABEL_MAX_CHARS = 26;
const LABEL_STAGGER = [0, 0.35, 0.7];

const staggerFor = (index) => LABEL_STAGGER[index % LABEL_STAGGER.length];

function clampLabel(text) {
  const t = String(text ?? '');
  return t.length > LABEL_MAX_CHARS ? `${t.slice(0, LABEL_MAX_CHARS - 1).trimEnd()}\u2026` : t;
}

function edgeShift(x) {
  const ax = Math.abs(x);
  if (ax >= 5.2) return x > 0 ? -96 : 96;
  if (ax >= 3.4) return x > 0 ? -52 : 52;
  return 0;
}

function labelStyle({ variant = 'clue', found = false, solved = false, hover = false } = {}) {
  const style = {
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    lineHeight: 1.45,
    textAlign: 'center',
    padding: '7px 11px',
    maxWidth: '205px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#ecdfc2',
    background: 'rgba(12, 9, 7, 0.72)',
    border: '1px solid rgba(201, 162, 74, 0.45)',
    borderRadius: '2px',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.45)',
  };
  if (variant === 'puzzle') {
    style.border = '1px solid rgba(217, 181, 93, 0.7)';
    style.color = '#f0d9a0';
  }
  if (variant === 'travel') {
    style.border = '1px solid rgba(127, 180, 255, 0.6)';
    style.color = '#d6e4ff';
  }
  if (found) {
    style.color = '#a99a80';
    style.background = 'rgba(10, 8, 6, 0.55)';
    style.border = '1px solid rgba(201, 162, 74, 0.22)';
  }
  if (solved) {
    style.cursor = 'default';
    style.color = '#8f8168';
    style.background = 'rgba(10, 8, 6, 0.5)';
    style.border = '1px solid rgba(201, 162, 74, 0.18)';
  }
  if (hover && !solved) {
    style.background = 'linear-gradient(180deg, #e6c877, #c9a24a)';
    style.color = '#241708';
    style.border = '1px solid transparent';
    if (variant === 'travel') {
      style.background = 'linear-gradient(180deg, #9cc2ff, #5b8fdd)';
      style.color = '#08101f';
    }
  }
  return style;
}

function labelChip({ x, ...rest }) {
  return { ...labelStyle(rest), transform: `translateX(${edgeShift(x)}px)` };
}

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

function Prop({ model, position, rotation = [0, 0, 0], tint, scale }) {
  return (
    <GLTFModel
      url={F(model)}
      position={position}
      rotation={rotation}
      scale={scale ?? SCALE[model] ?? 1}
      tint={tint ?? TINT[model]}
    />
  );
}

function Character({ url, label, clip = 'idle', position = [0, 0, 0], rotation = [0, 0, 0], onClick, focused = false, showLabel = true, labelOffsetY = 0, onMeasure, character }) {
  const [hover, setHover] = useState(false);
  return <group position={position} rotation={focused ? [0, 0, 0] : rotation}>
    <Actor character={character} pose={clip} focused={focused} speaking={focused} onMeasure={onMeasure} />
    <mesh position={[0, 0.9, 0]} onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={() => { setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}>
      <cylinderGeometry args={[0.5, 0.5, 1.9, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    {showLabel && <Html position={[0, 2.1 + labelOffsetY, 0]} center zIndexRange={[30, 0]}>
      <button className="hotspot" style={labelChip({ x: position[0], hover })} onClick={onClick}>{clampLabel(label)}</button>
    </Html>}
  </group>;
}

// ---------- hotspot markers ----------

// Hotspots usually carry an authored [x, y, z]; when position is missing we
// fan markers across the room front so nothing stacks at the origin.
function hotspotPosition(hotspot, index = 0) {
  const p = hotspot?.position;
  if (Array.isArray(p) && p.length >= 3) {
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
  }
  const col = index % 4;
  const row = Math.floor(index / 4);
  return [(col - 1.5) * 2.2, 0, -1.0 - row * 1.6];
}

function ClueMarker({ hotspot, position, found, onClick, pad = [1.7, 2, 1.7], labelY = 1.7, labelOffsetY = 0 }) {
  const [hover, setHover] = useState(false);
  const [x, y, z] = position ?? hotspot.position ?? [0, 0, 0];
  return (
    <group>
      <Html position={[x, y + labelY + labelOffsetY, z]} center distanceFactor={10} zIndexRange={[30, 0]}>
        <button
          className={`hotspot ${found ? 'found' : ''}`}
          style={labelChip({ x, found, hover })}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
        >
          {found ? `${clampLabel(hotspot.label)} \u2713` : clampLabel(hotspot.label)}
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

function PuzzleMarker({ hotspot, position, solved = false, labelOffsetY = 0, onClick }) {
  const [hover, setHover] = useState(false);
  const [x, y, z] = position ?? hotspot.position ?? [0, 0, 0];
  const ring = useRef();

  useFrame((state) => {
    const m = ring.current;
    if (!m || solved) return;
    const t = state.clock.elapsedTime;
    m.scale.setScalar(1 + Math.sin(t * 2.2) * 0.1);
    m.material.emissiveIntensity = 1.5 + Math.sin(t * 2.2) * 0.7;
  });

  return (
    <group>
      <Html position={[x, y + 1.85 + labelOffsetY, z]} center distanceFactor={10} zIndexRange={[30, 0]}>
        <button
          className={`hotspot puzzle ${solved ? 'solved' : ''}`}
          style={labelChip({ x, variant: 'puzzle', solved, hover })}
          onClick={(e) => {
            e.stopPropagation();
            if (!solved) onClick();
          }}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
        >
          {solved ? `${clampLabel(hotspot.label)} \u2713` : clampLabel(hotspot.label)}
        </button>
      </Html>
      <mesh ref={ring} position={[x, y + 0.95, z]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.42, 0.05, 12, 36]} />
        <meshStandardMaterial
          color="#d9b55d"
          emissive="#c99a3a"
          emissiveIntensity={solved ? 0.15 : 1.8}
          metalness={0.8}
          roughness={0.3}
          transparent
          opacity={solved ? 0.3 : 1}
        />
      </mesh>
      {!solved && (
        <>
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
            <boxGeometry args={[1.4, 2, 1.4]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <pointLight
            position={[x, y + 1, z + 0.4]}
            intensity={hover ? 1.7 : 0.7}
            distance={4.5}
            decay={0}
            color="#ffd98a"
          />
        </>
      )}
    </group>
  );
}

function TravelMarker({ hotspot, position, labelOffsetY = 0, onClick }) {
  const [hover, setHover] = useState(false);
  const [x, y, z] = position ?? hotspot.position ?? [0, 0, 0];
  const ring = useRef();

  useFrame((state) => {
    const m = ring.current;
    if (!m) return;
    m.material.emissiveIntensity = 1.1 + Math.sin(state.clock.elapsedTime * 2.6) * 0.35;
  });

  return (
    <group>
      <Html position={[x, y + 2.15 + labelOffsetY, z]} center distanceFactor={10} zIndexRange={[30, 0]}>
        <button
          className="hotspot travel"
          style={labelChip({ x, variant: 'travel', hover })}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
        >
          {clampLabel(hotspot.label)}
        </button>
      </Html>
      <mesh ref={ring} position={[x, y + 1.1, z]}>
        <torusGeometry args={[0.62, 0.05, 12, 40]} />
        <meshStandardMaterial
          color="#7fb4ff"
          emissive="#4a7fd9"
          emissiveIntensity={1.3}
          metalness={0.55}
          roughness={0.4}
        />
      </mesh>
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
        <boxGeometry args={[1.6, 2.2, 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hover && <pointLight position={[x, 1.6, z + 0.6]} intensity={1.2} distance={4.5} decay={0} color="#bcd8ff" />}
    </group>
  );
}

function ScriptedFigure({ hotspot, position, labelOffsetY = 0, onClick }) {
  const [hover, setHover] = useState(false);
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.86, 0]} castShadow>
        <capsuleGeometry args={[0.17, 0.82, 6, 12]} />
        <meshStandardMaterial color="#2c3038" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.58, 0]} castShadow>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#2c3038" roughness={0.9} />
      </mesh>
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
      {hover && (
        <pointLight position={[0, 1.9, 0.8]} intensity={1.4} distance={4.5} decay={0} color="#ffd9a0" />
      )}
      <Html position={[0, 2.45 + labelOffsetY, 0]} center distanceFactor={10} zIndexRange={[30, 0]}>
        <button
          className="hotspot"
          style={labelChip({ x, hover })}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
        >
          {clampLabel(hotspot.label)}
        </button>
      </Html>
    </group>
  );
}

function CharacterHotspot({ hotspot, position, hot, rotation, labelOffsetY = 0 }) {
  return <Character character={hotspot.character} label={hotspot.label} position={[position[0], 0, position[2]]}
    rotation={rotation ?? [0, -0.5, 0]} focused={hot.focusId === hotspot.character}
    showLabel={hot.focusId !== hotspot.character} labelOffsetY={labelOffsetY}
    onMeasure={(height) => hot.onMeasure(hotspot.character, height)}
    onClick={() => hot.onCharacter?.(hotspot)} />;
}

function HotspotMarkers({ room, hot }) {
  return (
    <>
      {(room.hotspots ?? []).map((h, i) => {
        const position = hotspotPosition(h, i);
        const labelOffsetY = staggerFor(i);
        if (h.type === 'character') {
          return (
            <CharacterHotspot
              key={h.id ?? i}
              hotspot={h}
              position={position}
              hot={hot}
              labelOffsetY={labelOffsetY}
            />
          );
        }
        if (h.type === 'puzzle') {
          return (
            <PuzzleMarker
              key={h.id ?? i}
              hotspot={h}
              position={position}
              solved={(hot.solvedPuzzles ?? []).includes(h.puzzle)}
              labelOffsetY={labelOffsetY}
              onClick={() => hot.onPuzzle?.(h)}
            />
          );
        }
        if (h.type === 'travel') {
          return (
            <TravelMarker
              key={h.id ?? i}
              hotspot={h}
              position={position}
              labelOffsetY={labelOffsetY}
              onClick={() => hot.onTravel?.(h)}
            />
          );
        }
        return (
          <ClueMarker
            key={h.id ?? i}
            hotspot={h}
            position={position}
            found={(hot.state.discovered ?? []).includes(h.clue)}
            labelOffsetY={labelOffsetY}
            onClick={() => hot.onClue?.(h)}
          />
        );
      })}
    </>
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

function Floor({ width, depth, repeat = [7, 5], color = '#b09070' }) {
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
      <meshStandardMaterial map={diffuse} color={color} roughness={0.92} />
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

function SceneProp({ model, hotspot, position, found, onClick, offset = [0, 0, 0], labelY, labelOffsetY = 0 }) {
  const [x, y, z] = position ?? hotspotPosition(hotspot, 0);
  return (
    <group>
      <Prop model={model} position={[x + offset[0], y + offset[1], z + offset[2]]} />
      <ClueMarker
        hotspot={hotspot}
        position={[x, y, z]}
        found={found}
        onClick={onClick}
        labelY={labelY ?? 1.7}
        labelOffsetY={labelOffsetY}
        pad={[1.6, 2, 1.6]}
      />
    </group>
  );
}

// ---------- kit primitives ----------

function Ground({ width = 30, depth = 30, color = '#131c14' }) {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
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

function Bench({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.08, 0.45]} />
        <meshStandardMaterial color="#4a3524" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.72, -0.19]} rotation-x={-0.15} castShadow>
        <boxGeometry args={[1.6, 0.4, 0.06]} />
        <meshStandardMaterial color="#4a3524" roughness={0.9} />
      </mesh>
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.08, 0.44, 0.4]} />
          <meshStandardMaterial color="#2a2020" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function LampPost({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 3, 8]} />
        <meshStandardMaterial color="#1c1c22" roughness={0.7} />
      </mesh>
      <mesh position={[0, 3.05, 0]}>
        <sphereGeometry args={[0.2, 14, 14]} />
        <meshStandardMaterial color="#ffe6b0" emissive="#ffcf7a" emissiveIntensity={2.4} />
      </mesh>
      <pointLight position={[0, 3, 0]} color="#ffd9a0" intensity={1.4} distance={11} decay={0} />
    </group>
  );
}

function Stairs({ position, rotation = [0, 0, 0], steps = 6 }) {
  return (
    <group position={position} rotation={rotation}>
      {[...Array(steps)].map((_, i) => (
        <mesh key={i} position={[0, 0.15 + i * 0.3, -i * 0.34]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.3, 0.36]} />
          <meshStandardMaterial color="#4a3524" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.15 + steps * 0.3, -steps * 0.34 - 1.1]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.3, 2.2]} />
        <meshStandardMaterial color="#43301f" roughness={0.9} />
      </mesh>
    </group>
  );
}

function FileStack({ position }) {
  return (
    <group position={position}>
      {[0, 0.055, 0.11, 0.165].map((y, i) => (
        <mesh key={y} position={[(i % 2 ? -1 : 1) * 0.015, y, (i % 2 ? 1 : -1) * 0.01]} rotation-y={i * 0.12}>
          <boxGeometry args={[0.4, 0.05, 0.3]} />
          <meshStandardMaterial color={i % 2 ? '#cfc6ae' : '#bdb49c'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Bed({ position, rotation = [0, 0, 0], made = true }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.34, 2.1]} />
        <meshStandardMaterial color="#3a3028" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[1.62, 0.18, 2.0]} />
        <meshStandardMaterial color="#6a5a4a" roughness={0.95} />
      </mesh>
      {made ? (
        <mesh position={[0, 0.66, 0.25]} castShadow>
          <boxGeometry args={[1.64, 0.12, 1.6]} />
          <meshStandardMaterial color="#5a3f3a" roughness={0.95} />
        </mesh>
      ) : (
        <mesh position={[0.18, 0.66, 0.3]} rotation={[0, 0.14, 0]} castShadow>
          <boxGeometry args={[1.5, 0.14, 1.5]} />
          <meshStandardMaterial color="#52443a" roughness={0.95} />
        </mesh>
      )}
      <mesh position={[0, 0.68, -0.72]} castShadow>
        <boxGeometry args={[0.62, 0.14, 0.4]} />
        <meshStandardMaterial color="#8a8072" roughness={0.95} />
      </mesh>
      {!made && (
        <mesh position={[0.5, 0.68, -0.4]} rotation={[0, -0.3, 0.08]} castShadow>
          <boxGeometry args={[0.5, 0.12, 0.35]} />
          <meshStandardMaterial color="#8a8072" roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

function Laptop({ position, rotation = [0, 0, 0], open = true }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <boxGeometry args={[0.6, 0.02, 0.34]} />
        <meshStandardMaterial color="#1b1c22" roughness={0.5} />
      </mesh>
      {open && (
        <group position={[0, 0.05, -0.16]} rotation-x={-0.35}>
          <mesh position={[0, 0.28, 0]} castShadow>
            <boxGeometry args={[0.62, 0.42, 0.05]} />
            <meshStandardMaterial color="#15161c" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.28, 0.032]}>
            <planeGeometry args={[0.56, 0.36]} />
            <meshStandardMaterial color="#9fd2ff" emissive="#6aa9e8" emissiveIntensity={1.6} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function CRT({ position, rotation = [0, 0, 0], color = '#9fd2ff', glow = '#6aa9e8' }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.42, 0.1, 0.36]} />
        <meshStandardMaterial color="#b8b0a0" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[0.5, 0.44, 0.42]} />
        <meshStandardMaterial color="#c9c2b2" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.33, 0.215]}>
        <planeGeometry args={[0.4, 0.32]} />
        <meshStandardMaterial color={color} emissive={glow} emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

function Candle({ position, height = 0.22 }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.03, 0.035, height, 8]} />
        <meshStandardMaterial color="#e8dcc0" />
      </mesh>
      <mesh position={[0, height + 0.05, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#ffdf9a" emissive="#ffb84d" emissiveIntensity={3} />
      </mesh>
      <pointLight position={[0, height + 0.1, 0]} color="#ffca82" intensity={0.8} distance={4} decay={0} />
    </group>
  );
}

function CeilingFan({ position = [0, 3.05, 0] }) {
  const blades = useRef();
  useFrame((_, delta) => {
    if (blades.current) blades.current.rotation.y += delta * 3;
  });
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 6]} />
        <meshStandardMaterial color="#20202a" />
      </mesh>
      <group ref={blades} position={[0, -0.3, 0]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[0.52 * Math.cos(a), 0, -0.52 * Math.sin(a)]}
              rotation-y={a + Math.PI / 2}
            >
              <boxGeometry args={[1.0, 0.02, 0.16]} />
              <meshStandardMaterial color="#26262e" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Fluorescent({ position, delay = 0 }) {
  const bar = useRef();
  const light = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime + delay;
    const flicker = t % 7 < 0.6 && Math.sin(t * 60) > 0 ? 0.25 : 1.1;
    if (bar.current) bar.current.emissiveIntensity = flicker * 0.9;
    if (light.current) light.current.intensity = flicker * 1.1;
  });
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[2.6, 0.06, 0.24]} />
        <meshStandardMaterial ref={bar} color="#f2f4e8" emissive="#eef0dd" emissiveIntensity={1} />
      </mesh>
      <pointLight ref={light} position={[0, -0.2, 0]} color="#eef0dd" intensity={1.1} distance={12} decay={0} />
    </group>
  );
}

function HangingBulb({ position, color = '#ffd9a0' }) {
  const group = useRef();
  useFrame((state) => {
    if (group.current) group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.9) * 0.07;
  });
  return (
    <group ref={group} position={position}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
        <meshStandardMaterial color="#1a1a20" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color="#ffe6b0" emissive="#ffcf7a" emissiveIntensity={2.6} />
      </mesh>
      <pointLight position={[0, -0.15, 0]} color={color} intensity={1.3} distance={9} decay={0} />
    </group>
  );
}

function Wheelchair({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.5]} />
        <meshStandardMaterial color="#2c3038" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.95, -0.24]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.06]} />
        <meshStandardMaterial color="#2c3038" roughness={0.8} />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.32, 0.035, 10, 24]} />
          <meshStandardMaterial color="#7a7e88" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {[[-0.18, 0.16], [0.18, 0.16], [-0.18, -0.18], [0.18, -0.18]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.12, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.24, 8]} />
          <meshStandardMaterial color="#1c1e24" />
        </mesh>
      ))}
    </group>
  );
}

function Gurney({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[0.8, 0.1, 1.9]} />
        <meshStandardMaterial color="#9aa0a8" metalness={0.45} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[0.72, 0.14, 1.6]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.9} />
      </mesh>
      {[[-0.32, -0.7], [0.32, -0.7], [-0.32, 0.7], [0.32, 0.7]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.36, z]}>
          <cylinderGeometry args={[0.03, 0.03, 0.72, 8]} />
          <meshStandardMaterial color="#6a7078" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function SpeakerStack({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.9, 1.6, 0.7]} />
        <meshStandardMaterial color="#15151a" roughness={0.85} />
      </mesh>
      {[0.5, 0.95, 1.35].map((y) => (
        <mesh key={y} position={[0, y, 0.36]}>
          <circleGeometry args={[0.22, 20]} />
          <meshStandardMaterial color="#26262e" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function TrussLight({ position, color = '#ffd2a0' }) {
  return (
    <group position={position}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.09, 0.12, 0.3, 10]} />
        <meshStandardMaterial color="#22242a" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.18]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.1, 0.18, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} />
      </mesh>
      <pointLight position={[0, -0.15, 0.4]} color={color} intensity={0.7} distance={7} decay={0} />
    </group>
  );
}

function CrowdBlob({ position, scale = 1, color = '#141824' }) {
  const variants = ['sameer', 'parth', 'enakshi', 'veer', 'mother'];
  const person = variants[Math.abs(Math.round(position[0] * 3 + position[2] * 5)) % variants.length];
  return (
    <group position={position} scale={scale * 0.9} rotation={[0, Math.PI + position[0] * 0.04, 0]}>
      <Actor character={person} />
    </group>
  );
}

function Column({ position, height = 5, radius = 0.34 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[radius * 2.6, 0.6, radius * 2.6]} />
        <meshStandardMaterial color="#5a5044" roughness={0.9} />
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.85, radius, height, 14]} />
        <meshStandardMaterial color="#6a6052" roughness={0.9} />
      </mesh>
      <mesh position={[0, height - 0.25, 0]} castShadow>
        <boxGeometry args={[radius * 2.6, 0.5, radius * 2.6]} />
        <meshStandardMaterial color="#5a5044" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Banner({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 3.2, 6]} />
        <meshStandardMaterial color="#2a241c" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.7, 0.04]}>
        <planeGeometry args={[0.9, 2.2]} />
        <meshStandardMaterial color="#5c1017" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Emblem({ position, radius = 1.4 }) {
  return (
    <group position={position}>
      <mesh>
        <torusGeometry args={[radius, 0.07, 12, 48]} />
        <meshStandardMaterial
          color="#8a6b2f"
          metalness={0.85}
          roughness={0.35}
          emissive="#8a6b2f"
          emissiveIntensity={0.25}
        />
      </mesh>
      <mesh>
        <circleGeometry args={[radius * 0.92, 48]} />
        <meshStandardMaterial color="#241d14" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[radius * 0.5, 32]} />
        <meshStandardMaterial
          color="#c9a24a"
          emissive="#8a6b2f"
          emissiveIntensity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight position={[0, 0, 1.2]} color="#ffd98a" intensity={0.8} distance={7} decay={0} />
    </group>
  );
}

function WendigoMask({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[0.42, 0.6, 0.2]} />
        <meshStandardMaterial color="#181410" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.42, 0.02]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.3, 0.34, 10]} />
        <meshStandardMaterial color="#181410" roughness={0.9} />
      </mesh>
      {[-0.1, 0.1].map((x) =>
        [-1, 1].map((s) => (
          <mesh key={`${x}${s}`} position={[x + s * 0.12, 0.4, -0.02]} rotation-z={s * 0.5}>
            <coneGeometry args={[0.045, 0.7, 8]} />
            <meshStandardMaterial color="#2a231a" roughness={0.9} />
          </mesh>
        ))
      )}
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.02, 0.11]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#ff5a3a" emissive="#ff3a1a" emissiveIntensity={2.4} />
        </mesh>
      ))}
      <pointLight position={[0, 0.1, 0.7]} color="#ff8a5a" intensity={0.5} distance={4} decay={0} />
    </group>
  );
}

function Trophy({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.16, 0.12, 0.16]} />
        <meshStandardMaterial color="#2a241c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.16, 8]} />
        <meshStandardMaterial color="#c9a24a" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial
          color="#d9b55d"
          metalness={0.9}
          roughness={0.25}
          emissive="#8a6b2f"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
}

function Picture({ src, position, rotation = [0, 0, 0], width = 1.2, height = 1.6 }) {
  const tex = useTexture(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.12, height + 0.12, 0.05]} />
        <meshStandardMaterial color="#2a2018" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
    </group>
  );
}

function StringLights({ from = [-4, 3, 0], to = [4, 2.8, 0], count = 9 }) {
  const bulbs = [...Array(count)].map((_, i) => {
    const t = (i + 0.5) / count;
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * 0.5,
      from[2] + (to[2] - from[2]) * t,
    ];
  });
  return (
    <group>
      {bulbs.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#ffe6b0" emissive="#ffcf7a" emissiveIntensity={2.2} />
        </mesh>
      ))}
      <pointLight
        position={[(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 0.6, from[2]]}
        color="#ffd9a0"
        intensity={0.8}
        distance={8}
        decay={0}
      />
    </group>
  );
}

function Telescope({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.32, 0.45, Math.sin(a) * 0.32]}
            rotation={[0.28 * Math.sin(a), 0, -0.28 * Math.cos(a)]}
          >
            <cylinderGeometry args={[0.025, 0.03, 0.95, 8]} />
            <meshStandardMaterial color="#2a2a30" roughness={0.7} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.95, 0]} rotation-x={-0.6} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 1.1, 12]} />
        <meshStandardMaterial color="#c9c2b2" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Sedan({ position, rotation = [0, 0, 0] }) {
  const silver = { color: '#b8bcc4', metalness: 0.75, roughness: 0.35 };
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.5, 4.2]} />
        <meshStandardMaterial {...silver} />
      </mesh>
      <mesh position={[0, 0.95, -0.2]} castShadow>
        <boxGeometry args={[1.7, 0.44, 2.1]} />
        <meshStandardMaterial {...silver} />
      </mesh>
      <mesh position={[0, 0.97, -0.2]}>
        <boxGeometry args={[1.72, 0.36, 1.9]} />
        <meshStandardMaterial color="#0e1218" roughness={0.25} metalness={0.4} />
      </mesh>
      {[[-0.85, -1.35], [0.85, -1.35], [-0.85, 1.45], [0.85, 1.45]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.34, z]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.24, 16]} />
          <meshStandardMaterial color="#101014" roughness={0.85} />
        </mesh>
      ))}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.6, 2.12]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 12]} />
          <meshStandardMaterial color="#f0e6c8" emissive="#ffdf9a" emissiveIntensity={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 2.13]}>
        <boxGeometry args={[0.5, 0.12, 0.02]} />
        <meshStandardMaterial color="#d8d4c8" roughness={0.6} />
      </mesh>
    </group>
  );
}

function GrassPatch({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      {[...Array(6)].map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.18, 0.12, Math.sin(a) * 0.18]} rotation-z={Math.cos(a) * 0.2}>
            <coneGeometry args={[0.06, 0.28, 5]} />
            <meshStandardMaterial color="#1d2a18" roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function Skyline({ position = [0, 0, -16], count = 9 }) {
  return (
    <group position={position}>
      {[...Array(count)].map((_, i) => {
        const h = 2 + ((i * 37) % 5) * 1.1;
        const x = (i - (count - 1) / 2) * 3.1;
        return (
          <mesh key={i} position={[x, h / 2, 0]}>
            <boxGeometry args={[2.4, h, 2.4]} />
            <meshStandardMaterial color="#0c0e14" roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function NeonStrip({ position, rotation = [0, 0, 0], color = '#c95aff', length = 2.4 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[length, 0.05, 0.05]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} />
      </mesh>
      <pointLight color={color} intensity={0.9} distance={7} decay={0} />
    </group>
  );
}

function Window({ position, rotation = [0, 0, 0], width = 1.6, height = 1.4, moon = true }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#0a0f1e" roughness={1} />
      </mesh>
      {moon && (
        <mesh position={[width * 0.18, height * 0.22, 0.02]}>
          <circleGeometry args={[0.22, 24]} />
          <meshBasicMaterial color="#dfe8ff" />
        </mesh>
      )}
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.06, height, 0.04]} />
        <meshStandardMaterial color="#2a2018" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[width, 0.06, 0.04]} />
        <meshStandardMaterial color="#2a2018" roughness={0.8} />
      </mesh>
      <pointLight position={[0, 0, 0.8]} color="#9fb2ea" intensity={0.7} distance={7} decay={0} />
    </group>
  );
}

function Poster({ position, rotation = [0, 0, 0], color = '#2a3550', width = 0.9, height = 1.2 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[width, height, 0.03]} />
        <meshStandardMaterial color="#1c1712" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[width - 0.08, height - 0.08]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ---------- demo rooms ----------

function Ballroom({ room, hot }) {
  const { state, focusId, onMeasure, onCharacter, onClue, onPuzzle, onTravel, solvedPuzzles } = hot;
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

      {(room.hotspots ?? []).map((h, i) => {
        if (h.type === 'character') {
          return (
            <Character
              key={h.id ?? i}
              url={CHARACTER_URL(h.character)} character={h.character}
              label={h.label}
              clip="idle"
              position={hotspotPosition(h, i)}
              rotation={[0, h.character === 'victor' ? 0.5 : -0.5, 0]}
              focused={focusId === h.character}
              showLabel={focusId !== h.character}
              labelOffsetY={staggerFor(i)}
              onMeasure={(height) => onMeasure(h.character, height)}
              onClick={() => onCharacter(h)}
            />
          );
        }
        if (h.clue === 'sheet_music') {
          return (
            <group key={h.id ?? i}>
              <Piano position={hotspotPosition(h, i)} />
              <ClueMarker
                hotspot={h}
                position={hotspotPosition(h, i)}
                found={(state.discovered ?? []).includes(h.clue)}
                onClick={() => onClue(h)}
                pad={[2.4, 2, 2]}
                labelY={1.25}
                labelOffsetY={staggerFor(i)}
              />
            </group>
          );
        }
        if (h.type === 'puzzle') {
          return (
            <PuzzleMarker
              key={h.id ?? i}
              hotspot={h}
              position={hotspotPosition(h, i)}
              solved={(solvedPuzzles ?? []).includes(h.puzzle)}
              labelOffsetY={staggerFor(i)}
              onClick={() => onPuzzle?.(h)}
            />
          );
        }
        if (h.type === 'travel') {
          return (
            <TravelMarker
              key={h.id ?? i}
              hotspot={h}
              position={hotspotPosition(h, i)}
              labelOffsetY={staggerFor(i)}
              onClick={() => onTravel?.(h)}
            />
          );
        }
        return null;
      })}
    </group>
  );
}

function Vestibule({ room, hot }) {
  const { state, focusId, onMeasure, onCharacter, onClue, onPuzzle, onTravel, solvedPuzzles } = hot;
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

      {(room.hotspots ?? []).map((h, i) => {
        if (h.type === 'character') {
          return (
            <Character
              key={h.id ?? i}
              url={CHARACTER_URL(h.character)} character={h.character}
              label={h.label}
              position={hotspotPosition(h, i)}
              focused={focusId === h.character}
              showLabel={focusId !== h.character}
              labelOffsetY={staggerFor(i)}
              onMeasure={(height) => onMeasure(h.character, height)}
              onClick={() => onCharacter(h)}
            />
          );
        }
        if (h.clue === 'stage_door') {
          return (
            <SceneProp
              key={h.id ?? i}
              model="doorway.glb"
              hotspot={h}
              position={hotspotPosition(h, i)}
              found={(state.discovered ?? []).includes(h.clue)}
              onClick={() => onClue(h)}
              offset={[0, 0, -0.75]}
              labelY={2.1}
              labelOffsetY={staggerFor(i)}
            />
          );
        }
        if (h.type === 'puzzle') {
          return (
            <PuzzleMarker
              key={h.id ?? i}
              hotspot={h}
              position={hotspotPosition(h, i)}
              solved={(solvedPuzzles ?? []).includes(h.puzzle)}
              labelOffsetY={staggerFor(i)}
              onClick={() => onPuzzle?.(h)}
            />
          );
        }
        if (h.type === 'travel') {
          return (
            <TravelMarker
              key={h.id ?? i}
              hotspot={h}
              position={hotspotPosition(h, i)}
              labelOffsetY={staggerFor(i)}
              onClick={() => onTravel?.(h)}
            />
          );
        }
        return (
          <SceneProp
            key={h.id ?? i}
            model="sideTable.glb"
            hotspot={h}
            position={hotspotPosition(h, i)}
            found={(state.discovered ?? []).includes(h.clue)}
            onClick={() => onClue(h)}
            labelOffsetY={staggerFor(i)}
          />
        );
      })}
    </group>
  );
}

// ---------- interactive room kits ----------

function GazeboRoom({room,hot}) {
  return <group>
    <ParkGround />
    <CinemaProp asset="gazebo" position={[0,0,0]} height={3.32}/>
    <CinemaProp asset="painted_wooden_bench" position={[0,.2,1.1]} height={.615} width={1.9}/>
    <CinemaProp asset="painted_wooden_bench" position={[-3.4,0,2.6]} height={.615} width={1.9} rotation={[0,.5,0]}/>
    <CinemaProp asset="painted_wooden_bench" position={[3.6,0,2.2]} height={.615} width={1.9} rotation={[0,-.7,0]}/>
    <CinemaProp asset="street_lamp_02" position={[-4.2,0,-2]} height={3.6}/>
    <CinemaProp asset="street_lamp_02" position={[4.2,0,-2]} height={3.6}/>
    <pointLight position={[0,2.6,0]} color="#ffca8b" intensity={8} distance={7}/>
    <pointLight position={[-4.2,2.8,-2]} color="#ffca8b" intensity={7} distance={10}/>
    <pointLight position={[4.2,2.8,-2]} color="#ffca8b" intensity={7} distance={10}/>
    <CinemaProp asset="tree_small_02" position={[-4.5,0,-4.5]} height={5.2}/>
    <CinemaProp asset="tree_small_02" position={[4.5,0,-4]} height={5.5} rotation={[0,1.4,0]}/>
    <CinemaProp asset="tree_small_02" position={[-1.6,0,-7.3]} height={6}/>
    <HotspotMarkers room={room} hot={hot}/>
  </group>;
}

function HomeRoom({ room, hot }) {
  return (
    <group>
      <Shell width={13} depth={10} height={3.6} tint="#5a4038" />
      <Floor width={13} depth={10} repeat={[6, 5]} />
      <Stairs position={[5.2, 0, 3.2]} />
      <Prop model="loungeSofa.glb" position={[-4.4, 0, 1.6]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="rugRectangle.glb" position={[-2.6, 0.02, 1.5]} />
      <Prop model="loungeChair.glb" position={[-2.2, 0, 0.4]} rotation={[0, 0.5, 0]} />
      <Prop model="sideTable.glb" position={[-3.4, 0, 1.5]} />
      <Prop model="lampRoundFloor.glb" position={[-4.9, 0, 3.2]} />
      <Prop model="lampRoundTable.glb" position={[-3.4, 0.52, 1.5]} />
      <pointLight position={[-3.4, 1.4, 1.5]} color="#ffca82" intensity={1.2} distance={7} decay={0} />
      <Prop model="tableGlass.glb" position={[2.2, 0, 2.2]} />
      <Prop model="chair.glb" position={[1.2, 0, 2.4]} rotation={[0, 1.0, 0]} />
      <Prop model="chair.glb" position={[3.2, 0, 2.0]} rotation={[0, -2.0, 0]} />
      <Prop model="bookcaseOpen.glb" position={[5.9, 0, 1.4]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="bookcaseClosed.glb" position={[5.9, 0, -0.4]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="pottedPlant.glb" position={[-5.6, 0, -4.0]} />
      <Prop model="lampWall.glb" position={[0, 2.4, -4.85]} />
      <pointLight position={[0, 2.3, -3.6]} color="#ffb070" intensity={0.8} distance={8} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function PoliceStationRoom({ room, hot }) {
  return (
    <group>
      <Shell width={14} depth={10} height={3.4} tint="#4a4e58" />
      <Floor width={14} depth={10} repeat={[6, 5]} color="#8f8578" />
      <Prop model="kitchenBar.glb" position={[-5.6, 0, -3.2]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="kitchenBar.glb" position={[-5.6, 0, -1.5]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="desk.glb" position={[-1.6, 0, -1.2]} rotation={[0, 0.15, 0]} />
      <Prop model="chairDesk.glb" position={[-1.6, 0, 0.1]} rotation={[0, Math.PI, 0]} />
      <Prop model="desk.glb" position={[1.9, 0, -1.6]} rotation={[0, -0.12, 0]} />
      {/* Kenney's chair origin is its corner; align the seat centre with the seated rig. */}
      <Prop model="chairDesk.glb" position={[2.252, 0, -0.630]} rotation={[0, Math.PI, 0]} />
      <FileStack position={[-1.2, 0.8, -1.5]} />
      <FileStack position={[1.5, 0.8, -1.9]} />
      <FileStack position={[-5.0, 1.05, -2.3]} />
      <Prop model="bookcaseClosed.glb" position={[6.2, 0, -3.0]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="bookcaseOpen.glb" position={[6.2, 0, -0.9]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="stoolBar.glb" position={[-3.9, 0, 1.6]} rotation={[0, 0.4, 0]} />
      <Prop model="chair.glb" position={[4.4, 0, 1.8]} rotation={[0, -0.6, 0]} />
      <Prop model="chair.glb" position={[5.2, 0, 2.4]} rotation={[0, -1.4, 0]} />
      <Fluorescent position={[0, 3.15, -1.2]} />
      <Fluorescent position={[0, 3.15, 1.9]} delay={2.5} />
      <pointLight position={[0, 2.4, 0.5]} color="#eef0dd" intensity={0.7} distance={13} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function SameerRoomScene({ room, hot }) {
  return (
    <group>
      <Shell width={10} depth={8} height={3.2} tint="#3a2e26" />
      <Floor width={10} depth={8} repeat={[5, 4]} />
      <Bed position={[-3.0, 0, -1.0]} rotation={[0, 0.12, 0]} />
      <Prop model="desk.glb" position={[2.3, 0, -0.6]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="chairDesk.glb" position={[1.630, 0, -0.248]} rotation={[0, Math.PI / 2, 0]} />
      <Laptop position={[2.6, 0.76, -0.4]} rotation={[0, -1.1, 0]} />
      <CeilingFan position={[0, 3.05, 0]} />
      <Window position={[4.95, 1.75, -1.6]} rotation={[0, -Math.PI / 2, 0]} />
      <Poster position={[-4.3, 1.8, -1.2]} rotation={[0, Math.PI / 2, 0]} color="#22304a" />
      <Poster position={[-4.3, 1.6, 0.6]} rotation={[0, Math.PI / 2, 0]} color="#4a2230" />
      <Prop model="lampRoundTable.glb" position={[2.3, 0.76, -1.4]} />
      <pointLight position={[2.4, 1.3, -0.6]} color="#ffd28a" intensity={0.9} distance={6} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function ParthRoomScene({ room, hot }) {
  return (
    <group>
      <Shell width={10} depth={8} height={3.2} tint="#443428" />
      <Floor width={10} depth={8} repeat={[5, 4]} />
      <Bed position={[-2.9, 0, -1.0]} rotation={[0, 0.18, 0]} made={false} />
      <Prop model="desk.glb" position={[2.4, 0, -0.7]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="chairDesk.glb" position={[1.4, 0, -0.6]} rotation={[0, Math.PI / 2, 0]} />
      <Laptop position={[2.75, 0.76, -0.5]} rotation={[0, -1.2, 0]} />
      <Prop model="bookcaseOpen.glb" position={[-4.6, 0, -3.3]} />
      <Prop model="bookcaseClosed.glb" position={[4.7, 0, -3.3]} rotation={[0, -Math.PI / 2, 0]} />
      <Window position={[4.95, 1.8, -1.2]} rotation={[0, -Math.PI / 2, 0]} />
      <Picture
        src={`${ASSETS}/pictures/evidence_gone_poster.jpg`}
        position={[-4.3, 1.85, 0.9]}
        rotation={[0, Math.PI / 2, 0]}
        width={0.9}
        height={1.3}
      />
      <Prop model="lampRoundTable.glb" position={[2.3, 0.76, -1.5]} />
      <pointLight position={[2.5, 1.3, -0.7]} color="#ffd28a" intensity={0.9} distance={6} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function AbandonedFieldRoom({ room, hot }) {
  return (
    <group>
      <Ground width={34} depth={34} color="#1b1712" />
      <Sedan position={[-1.4, 0, -1.6]} rotation={[0, 0.5, 0]} />
      <GrassPatch position={[-3.4, 0, 0.6]} scale={1.2} />
      <GrassPatch position={[1.4, 0, 1.2]} scale={0.9} />
      <GrassPatch position={[3.4, 0, -0.4]} scale={1.05} />
      <GrassPatch position={[-4.2, 0, -3.0]} scale={0.8} />
      <GrassPatch position={[0.4, 0, -4.2]} scale={1.15} />
      <Tree position={[-8.0, 0, -6.0]} scale={1.2} />
      <Tree position={[9.0, 0, -7.0]} scale={0.95} />
      <LampPost position={[7.5, 0, 3.0]} />
      <Skyline position={[0, 0, -16]} count={9} />
      <Moon />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function CyberCafeRoom({ room, hot }) {
  return (
    <group>
      <Shell width={12} depth={9} height={3.4} tint="#2e2b3a" />
      <Floor width={12} depth={9} repeat={[5, 4]} color="#7d7263" />
      {[
        [-2.9, -2.2, 0.1],
        [0.3, -2.5, -0.05],
        [3.3, -2.1, 0.12],
        [-2.6, 0.8, -0.1],
        [0.6, 0.5, 0.06],
        [3.5, 0.9, -0.08],
      ].map(([x, z, rot], i) => (
        <group key={i}>
          <Prop model="desk.glb" position={[x, 0, z]} rotation={[0, rot, 0]} />
          <CRT
            position={[x - Math.sin(rot) * 0.25, 0.78, z - Math.cos(rot) * 0.25]}
            rotation={[0, rot, 0]}
            color={i % 2 ? '#9fd2ff' : '#a8ffd0'}
            glow={i % 2 ? '#6aa9e8' : '#4ad99a'}
          />
          <Prop model="chair.glb" position={[x, 0, z + 0.9]} rotation={[0, Math.PI + rot, 0]} />
        </group>
      ))}
      <Prop model="kitchenBar.glb" position={[4.7, 0, -3.7]} rotation={[0, -Math.PI / 2, 0]} />
      <group position={[4.3, 1.12, -3.05]} rotation={[0, 0.25, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.14, 0.3]} />
          <meshStandardMaterial color="#1c1c22" roughness={0.6} />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.08, 0]} rotation-x={-Math.PI / 2}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 12]} />
            <meshStandardMaterial color="#4a4a52" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
      </group>
      <NeonStrip position={[-4.4, 2.6, -4.4]} color="#c95aff" length={3} />
      <NeonStrip position={[0, 2.7, -4.4]} color="#5ad0ff" length={4} />
      <NeonStrip position={[4.2, 2.5, -4.4]} color="#ff5a9a" length={2.2} />
      <Prop model="pottedPlant.glb" position={[-5.4, 0, 3.4]} />
      <pointLight position={[0, 2.2, -2]} color="#8a6ae8" intensity={0.6} distance={10} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function ConcertRoom({ room, hot }) {
  const trussColors = ['#ffd2a0', '#c95aff', '#5ad0ff', '#ffd2a0', '#ff8a5a'];
  return (
    <group>
      <Ground width={30} depth={26} color="#14110f" />
      <group position={[0, 0, -5.5]}>
        <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
          <boxGeometry args={[13, 0.8, 4.5]} />
          <meshStandardMaterial color="#2a1a12" roughness={0.75} />
        </mesh>
        <mesh position={[0, 3.1, -2.0]}>
          <planeGeometry args={[13, 4.6]} />
          <meshStandardMaterial color="#3a0f14" roughness={0.9} />
        </mesh>
        {[-6, -3, 0, 3, 6].map((x) => (
          <mesh key={x} position={[x, 2.2, -1.8]} castShadow>
            <boxGeometry args={[0.24, 4.4, 0.24]} />
            <meshStandardMaterial color="#22242a" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 4.3, -1.6]}>
          <boxGeometry args={[13, 0.28, 0.28]} />
          <meshStandardMaterial color="#22242a" metalness={0.5} roughness={0.5} />
        </mesh>
        {[-5.2, -2.6, 0, 2.6, 5.2].map((x, i) => (
          <TrussLight key={x} position={[x, 4.0, -1.5]} color={trussColors[i]} />
        ))}
      </group>
      <SpeakerStack position={[-7.5, 0, -4.2]} scale={1.4} />
      <SpeakerStack position={[7.5, 0, -4.2]} scale={1.4} />
      {[...Array(18)].map((_, i) => {
        const row = Math.floor(i / 6);
        const col = i % 6;
        return (
          <CrowdBlob
            key={i}
            position={[(col - 2.5) * 1.6 + (row % 2 ? 0.7 : 0), 0, 1.4 + row * 1.5]}
            scale={0.92 + ((i * 13) % 5) * 0.06}
          />
        );
      })}
      <LampPost position={[-9.5, 0, 2.5]} />
      <LampPost position={[9.5, 0, 2.5]} />
      <Tree position={[-10, 0, -6]} scale={1.1} />
      <Tree position={[10.5, 0, -5]} scale={1.0} />
      <Moon position={[7, 8, -16]} size={1.4} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function WorkshopRoom({ room, hot }) {
  return (
    <group>
      <Ground width={32} depth={30} color="#171b12" />
      <Prop model="table.glb" position={[-3.2, 0, -2.0]} />
      <Prop model="tableCloth.glb" position={[-0.4, 0, -2.4]} />
      <Prop model="table.glb" position={[2.6, 0, -1.8]} />
      <Prop model="chair.glb" position={[-3.9, 0, -1.0]} rotation={[0, 0.6, 0]} />
      <Prop model="chair.glb" position={[-2.4, 0, -0.9]} rotation={[0, -0.6, 0]} />
      <Prop model="chair.glb" position={[1.8, 0, -0.8]} rotation={[0, 0.9, 0]} />
      <Prop model="chair.glb" position={[3.4, 0, -0.9]} rotation={[0, -0.9, 0]} />
      <Telescope position={[4.6, 0, -2.6]} rotation={[0, -0.5, 0]} />
      <group position={[-0.2, 0.78, -2.4]}>
        {[[-0.3, 0.05], [0, -0.08], [0.3, 0.02]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.06, z]} rotation-y={i * 0.5} castShadow>
            <boxGeometry args={[0.24, 0.12, 0.18]} />
            <meshStandardMaterial color={i % 2 ? '#c9a24a' : '#b45a3a'} roughness={0.8} />
          </mesh>
        ))}
      </group>
      {[-4.5, 4.5].map((x) => (
        <mesh key={x} position={[x, 1.6, -3.4]} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 3.2, 8]} />
          <meshStandardMaterial color="#2a241c" roughness={0.8} />
        </mesh>
      ))}
      <StringLights from={[-4.5, 3.1, -3.4]} to={[4.5, 3.05, -3.4]} count={11} />
      <Moon position={[-6, 7, -15]} size={1.5} />
      <Tree position={[-8.5, 0, -4]} scale={1.2} />
      <Tree position={[8.8, 0, -5]} scale={1.0} />
      <Tree position={[-7.5, 0, 4]} scale={0.9} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function NgoHqRoom({ room, hot }) {
  return (
    <group>
      <Shell width={18} depth={14} height={5} tint="#4a4248" />
      <Floor width={18} depth={14} repeat={[8, 6]} color="#a08a72" />
      {[-6.3, -2.1, 2.1, 6.3].map((x) => (
        <Column key={`b${x}`} position={[x, 0, -5.4]} height={5} />
      ))}
      {[-6.3, 6.3].map((x) => (
        <Column key={`f${x}`} position={[x, 0, 1.6]} height={5} />
      ))}
      <Emblem position={[0, 2.7, -6.9]} radius={1.4} />
      <Banner position={[-5.6, 0, -6.6]} />
      <Banner position={[5.6, 0, -6.6]} />
      <Prop model="rugRectangle.glb" position={[0, 0.02, -0.6]} />
      <Prop model="kitchenBar.glb" position={[4.6, 0, -1.2]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="kitchenBar.glb" position={[6.1, 0, -1.2]} rotation={[0, -Math.PI / 2, 0]} />
      <mesh position={[5.35, 1.4, -1.2]} castShadow>
        <boxGeometry args={[2.8, 0.08, 1.0]} />
        <meshStandardMaterial color="#5a4630" roughness={0.8} />
      </mesh>
      <Prop model="pottedPlant.glb" position={[-7.6, 0, -4.6]} />
      <Prop model="pottedPlant.glb" position={[7.6, 0, -4.6]} />
      <pointLight position={[0, 3.6, -3]} color="#ffd2a0" intensity={1.4} distance={16} decay={0} />
      <pointLight position={[5.3, 2.2, -1.2]} color="#ffca82" intensity={0.9} distance={8} decay={0} />
      <spotLight
        position={[0, 4.8, -2]}
        angle={0.7}
        penumbra={0.9}
        intensity={1.1}
        distance={16}
        decay={0}
        color="#ffd2a0"
      />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function NgoArchiveRoom({ room, hot }) {
  return (
    <group>
      <Shell width={12} depth={9} height={3.2} tint="#3a3226" />
      <Floor width={12} depth={9} repeat={[5, 4]} color="#8a7a64" />
      {[-3.6, -1.2, 1.2, 3.6].map((x) => (
        <Prop key={x} model="bookcaseClosed.glb" position={[x, 0, -3.5]} />
      ))}
      <Prop model="bookcaseOpen.glb" position={[-5.6, 0, -2.2]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="bookcaseOpen.glb" position={[5.6, 0, -2.2]} rotation={[0, -Math.PI / 2, 0]} />
      <FileStack position={[-4.6, 0, -0.4]} />
      <FileStack position={[-3.9, 0, -0.7]} />
      <FileStack position={[3.2, 0, -0.9]} />
      <FileStack position={[3.9, 0, -0.6]} />
      <Prop model="desk.glb" position={[2.9, 0, -1.6]} rotation={[0, -Math.PI / 2, 0]} />
      <CRT position={[2.9, 0.78, -1.9]} rotation={[0, -Math.PI / 2, 0]} color="#a8ffd0" glow="#4ad99a" />
      <Prop model="chairDesk.glb" position={[1.7, 0, -1.7]} rotation={[0, Math.PI / 2, 0]} />
      <HangingBulb position={[-0.6, 2.35, -0.8]} />
      <pointLight position={[3, 1.4, -2]} color="#9fd2ff" intensity={0.35} distance={5} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function HospitalRoom({ room, hot }) {
  return (
    <group>
      <Shell width={16} depth={10} height={3.4} tint="#5a636e" />
      <Floor width={16} depth={10} repeat={[8, 5]} color="#9aa0a8" />
      <Prop model="doorway.glb" position={[-5.2, 0, -4.8]} />
      <Prop model="doorway.glb" position={[0, 0, -4.8]} />
      <Prop model="doorway.glb" position={[7.4, 0, -2.4]} rotation={[0, -Math.PI / 2, 0]} />
      <Fluorescent position={[-2.5, 3.15, -1.5]} />
      <Fluorescent position={[2.5, 3.15, 1.5]} delay={3.2} />
      <Fluorescent position={[0, 3.15, -3.8]} delay={1.4} />
      <Gurney position={[-4.6, 0, -1.2]} rotation={[0, 0.25, 0]} />
      <Wheelchair position={[4.2, 0, 0.6]} rotation={[0, -0.8, 0]} />
      <Prop model="chair.glb" position={[6.4, 0, 2.6]} rotation={[0, -1.2, 0]} />
      <Prop model="chair.glb" position={[5.4, 0, 2.9]} rotation={[0, -1.5, 0]} />
      <Prop model="chair.glb" position={[4.4, 0, 3.0]} rotation={[0, -1.7, 0]} />
      <Prop model="bookcaseClosed.glb" position={[-7.6, 0, -1.4]} rotation={[0, Math.PI / 2, 0]} />
      <pointLight position={[0, 2.5, 0]} color="#dfe6f2" intensity={0.6} distance={14} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function TanushOfficeRoom({ room, hot }) {
  return (
    <group>
      <Shell width={13} depth={10} height={3.8} tint="#4a3a34" />
      <Floor width={13} depth={10} repeat={[6, 5]} color="#a3856a" />
      <Prop model="rugRectangle.glb" position={[0.2, 0.02, 0.5]} />
      <Prop model="rugSquare.glb" position={[0.2, 0.04, -1.4]} />
      <Prop model="desk.glb" tint="#3f2418" position={[0.4, 0, -1.5]} />
      <Prop model="chairDesk.glb" tint="#3f2418" position={[0.4, 0, -0.2]} rotation={[0, Math.PI, 0]} />
      <Prop model="lampRoundTable.glb" position={[1.5, 0.76, -1.8]} />
      <FileStack position={[-0.5, 0.8, -1.6]} />
      <Prop model="bookcaseClosed.glb" tint="#3a2a20" position={[-5.7, 0, -2.2]} rotation={[0, Math.PI / 2, 0]} />
      <Trophy position={[-5.5, 1.78, -3.0]} />
      <Trophy position={[-5.5, 1.78, -2.2]} scale={1.15} />
      <Trophy position={[-5.5, 1.78, -1.4]} scale={0.9} />
      <Prop model="kitchenBar.glb" position={[5.4, 0, 1.8]} rotation={[0, -Math.PI / 2, 0]} />
      <WendigoMask position={[0.2, 2.15, -4.8]} />
      <pointLight position={[1.3, 1.6, -1.6]} color="#ffca82" intensity={1.1} distance={7} decay={0} />
      <pointLight position={[0.2, 2.0, -3.8]} color="#ff8a5a" intensity={0.45} distance={5} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

function EnakshiHouseRoom({ room, hot }) {
  return (
    <group>
      <Shell width={11} depth={9} height={3.4} tint="#3c3230" />
      <Floor width={11} depth={9} repeat={[5, 4]} color="#907a60" />
      <Prop model="loungeSofa.glb" position={[-2.8, 0, -0.6]} rotation={[0, 0.15, 0]} />
      <Prop model="rugSquare.glb" position={[0.2, 0.02, 0.5]} />
      <Prop model="loungeChair.glb" position={[2.0, 0, 1.0]} rotation={[0, -0.8, 0]} />
      <Prop model="sideTable.glb" position={[0.2, 0, -0.4]} />
      <Candle position={[0.05, 0.52, -0.4]} height={0.24} />
      <Candle position={[0.4, 0.52, -0.3]} height={0.16} />
      <Prop model="doorway.glb" position={[4.3, 0, -4.2]} rotation={[0, 0.5, 0]} />
      <mesh position={[4.3, 1.15, -4.65]} rotation={[0, 0.5, 0]}>
        <planeGeometry args={[1.0, 2.3]} />
        <meshStandardMaterial color="#0a0806" roughness={1} />
      </mesh>
      <Window position={[-5.35, 1.85, -1.4]} rotation={[0, Math.PI / 2, 0]} />
      <Prop model="bookcaseClosed.glb" position={[5.4, 0, 0.8]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop model="lampRoundFloor.glb" position={[-4.3, 0, 2.8]} />
      <pointLight position={[-4.3, 1.5, 2.8]} color="#ffca82" intensity={0.9} distance={7} decay={0} />
      <HotspotMarkers room={room} hot={hot} />
    </group>
  );
}

const ROOM_KITS = {
  ballroom: Ballroom,
  vestibule: Vestibule,
  gazebo: GazeboRoom,
  parth_home: HomeRoom,
  police_station: PoliceStationRoom,
  sameer_room: SameerRoomScene,
  parth_room: ParthRoomScene,
  abandoned_field: AbandonedFieldRoom,
  cyber_cafe: CyberCafeRoom,
  concert: ConcertRoom,
  workshop: WorkshopRoom,
  ngo_hq: NgoHqRoom,
  ngo_archive: NgoArchiveRoom,
  hospital: HospitalRoom,
  tanush_office: TanushOfficeRoom,
  enakshi_house: EnakshiHouseRoom,
};

// The campaign and every cinematic share the same fully modelled environments.
export const ROOM_IDS = Object.keys(ROOM_KITS);
export function RoomEnvironment({ roomId, room = null, hot = null }) {
  const Kit = ROOM_KITS[roomId] ?? SameerRoomScene;
  const empty = { id: roomId, hotspots: [] };
  return <Kit room={room ?? empty} hot={hot ?? { state: { discovered: [] }, solvedPuzzles: [] }} />;
}
export function RoomLighting({ roomId, quality = 'high' }) {
  const outdoor = OUTDOOR_ROOMS.has(roomId);
  return <>
    <Environment files={outdoor ? "/assets/cinema/park_bench_1k.hdr" : "/assets/env/ballroom_2k.hdr"} background={outdoor} backgroundBlurriness={.18} environmentIntensity={outdoor ? 0.5 : 0.62} />
    <ambientLight intensity={outdoor ? 0.65 : 0.8} color="#bdcce8" />
    <directionalLight position={[-4, 8, 6]} intensity={1.7} color="#c5d9ff" castShadow={quality !== 'low'}
      shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
      shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
      shadow-camera-far={38} shadow-bias={-0.0005} />
    <directionalLight position={[4, 4, -3]} intensity={0.6} color="#e0ab7b" />
  </>;
}

// ---------- canvas ----------

function EnvironmentIntensity({ value }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.environmentIntensity = value;
  }, [scene, value]);
  return null;
}

function CameraRig({ focusInfo }) {
  const { camera, controls } = useThree();
  const desiredPosition = useRef(new THREE.Vector3(0, 2.3, 7.8));
  const desiredLook = useRef(new THREE.Vector3(0, 1.5, -0.3));
  const transitioning = useRef(false);

  useEffect(() => {
    if (focusInfo) {
      desiredPosition.current.set(...focusInfo.camera);
      desiredLook.current.set(...focusInfo.look);
    } else {
      desiredPosition.current.set(0, 3.4, 8.8);
      desiredLook.current.set(0, 1.1, -0.4);
    }
    transitioning.current = true;
    if (controls) controls.enabled = !focusInfo;
  }, [focusInfo, controls]);

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

export default function Scene({
  state,
  roomId,
  focus,
  onCharacter,
  onClue,
  onPuzzle,
  onTravel,
  solvedPuzzles = [],
}) {
  const room = state.rooms.find((r) => r.id === roomId) ?? state.rooms[0];
  const isDemo = DEMO_ROOMS.has(room.id);
  const isOutdoor = OUTDOOR_ROOMS.has(room.id);
  const [heights, setHeights] = useState({});

  // Skinned meshes can report bogus bounds, so clamp to a believable range:
  // outside 1.4-2.4 m we assume the standard 1.9 m human.
  const measure = useCallback((id, height) => {
    const safe = height > 1.4 && height < 2.4 ? height : 1.9;
    setHeights((prev) => (prev[id] === safe ? prev : { ...prev, [id]: safe }));
  }, []);

  const focusPosition = useMemo(() => {
    if (!focus) return null;
    const [x, , z] = hotspotPosition(focus, 0); return [x, 0, z];
  }, [focus]);

  const focusInfo = useMemo(() => {
    if (!focus || !focusPosition) return null;
    const height = heights[focus.character] || 1.9;
    return {
      look: [focusPosition[0], focusPosition[1] + height * 0.82, focusPosition[2]],
      camera: [
        focusPosition[0] + height * 0.03,
        focusPosition[1] + height * 0.84,
        focusPosition[2] + height * 1.05,
      ],
    };
  }, [focus, focusPosition, heights]);

  const dofTarget = useMemo(
    () => new THREE.Vector3(...(focusInfo?.look ?? [0, 1.4, 0])),
    [focusInfo]
  );

  // Drive the depth-of-field focus directly on the effect instance; the
  // declarative target prop is only applied at construction time.
  const dofRef = useRef();
  useEffect(() => {
    const effect = dofRef.current;
    if (!effect) return;
    if (focusInfo) {
      effect.target = dofTarget;
      effect.focusRange = 2.2;
    } else {
      effect.target = null;
      effect.focusDistance = 14;
      effect.focusRange = 30;
    }
  }, [focusInfo, dofTarget]);

  const hot = useMemo(
    () => ({
      state,
      focusId: focus?.character,
      onMeasure: measure,
      onCharacter,
      onClue,
      onPuzzle,
      onTravel,
      solvedPuzzles,
    }),
    [state, focus, measure, onCharacter, onClue, onPuzzle, onTravel, solvedPuzzles]
  );

  const Kit = ROOM_KITS[room.id] ?? Vestibule;
  const bg = isOutdoor ? '#05070d' : '#080604';

  const { quality } = useSettings();
  return (
    <WorldBoundary key={room.id}>
      <Canvas shadows={quality !== 'low'} dpr={[1, quality === 'high' ? 1.65 : 1]} camera={{ position: [0, 3.4, 8.8], fov: 52 }}>
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={isOutdoor ? [bg, 25, 65] : [bg, 22, 42]} />
        <Suspense fallback={<SceneLoading />}>
          <RoomLighting roomId={room.id} quality={quality} />
          <RoomEnvironment roomId={room.id} room={room} hot={hot} />
          <OrbitControls makeDefault enablePan enableDamping dampingFactor={0.08}
            target={[0, 1.1, -0.4]} minDistance={2.6} maxDistance={16}
            minPolarAngle={0.35} maxPolarAngle={Math.PI / 2.02} />
          <CameraRig key={room.id} focusInfo={focusInfo} />
          <ExploreKeys disabled={!!focus} />
        </Suspense>
        {quality !== 'low' && <EffectComposer multisampling={quality === 'high' ? 2 : 0}>
          <Bloom intensity={0.18} luminanceThreshold={0.85} mipmapBlur />
          <Vignette offset={0.3} darkness={0.35} />
        </EffectComposer>}
      </Canvas>
    </WorldBoundary>
  );
}

function ExploreKeys({ disabled }) {
  const { camera, controls } = useThree();
  const keys = useRef(new Set());
  useEffect(() => {
    const down = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.closest('[role="dialog"]')) return;
      if (['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { keys.current.add(e.key); e.preventDefault(); }
    };
    const up = (e) => keys.current.delete(e.key);
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  useFrame((_, delta) => {
    if (disabled || !controls || !keys.current.size || document.querySelector('[role="dialog"], .story-overlay, .modal-backdrop')) return;
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const step = new THREE.Vector3();
    for (const key of keys.current) {
      if (['w','ArrowUp'].includes(key)) step.add(forward);
      if (['s','ArrowDown'].includes(key)) step.sub(forward);
      if (['a','ArrowLeft'].includes(key)) step.sub(right);
      if (['d','ArrowRight'].includes(key)) step.add(right);
    }
    if (step.lengthSq() === 0) return;
    step.normalize().multiplyScalar(Math.min(delta, 0.05) * 2.5);
    const next = camera.position.clone().add(step);
    if (Math.abs(next.x) > 6 || next.z < -3.2 || next.z > 12) return;
    camera.position.add(step); controls.target.add(step); controls.update();
  });
  return null;
}
