import './styles-scene.css';
import { CinemaProp, ParkGround, WindTree, CeilingFan } from './CinemaAssets.jsx';
import {DetailProp,InstancedDetailScatter,TerrainSurface,WallSign,Cable,ComputerStation,ShelfContents,FencePanel} from './EnvironmentDetails.jsx';
import { BEDROOM, SAMEER_BED, HOME_STAIRS, HOME_UPPER_DOORWAY, HOME_BEDROOM, backWallPanels, POLICE, HOSPITAL_BED, DESK_TOP, DESK_SEAT, PARTH_ANCHORS, PARK, DETAIL_ANCHORS,FIELD,FIELD_TRACKS,FIELD_BACKGROUND_BUILDING,FIELD_OVERGROWTH,ROOM_VIEWS,ROOM_BOUNDS,updateFieldBackpackOrbit } from './SceneLayout.js';
import DemonMask from './DemonMask.jsx';
import {seatContact} from './SceneStaging.js';
import Actor from './Actor.jsx';
import { useSettings } from './Settings.jsx';
import { SceneLoading, SceneWatchdog, WorldBoundary, WorldStopped, SceneReady } from './WorldBoundary.jsx';
import PerformanceGuard from './PerformanceGuard.jsx';
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

// The only furniture GLBs still fetched whole are the rugs; every other Prop
// model name remaps to a finished Poly Haven detail asset inside Prop().
// Kenney's kit ships at roughly half human scale; these bring each piece to
// believable real-world size (metres).
const SCALE = {
  'rugRectangle.glb': 1.7,
  'rugSquare.glb': 2.0,
};

// Colour grading: Kenney's palette is pastel, so each piece is multiplied
// towards the room's oxblood / dark-walnut palette.
const TINT = {
  'rugRectangle.glb': '#3f4a56',
  'rugSquare.glb': '#4a4038',
};

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

  // Tinted clones are ours to dispose — R3F deliberately never disposes primitives.
  useEffect(() => {
    if (!tint) return;
    return () => {
      model.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mat?.dispose?.();
      });
    };
  }, [model, tint]);

  const origin = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(model);
    return [-(bounds.min.x+bounds.max.x)/2, -bounds.min.y, -(bounds.min.z+bounds.max.z)/2];
  }, [model]);
  return <group position={position} rotation={rotation} scale={scale}><primitive object={model} position={origin} /></group>;
}

function Prop({ model, position, rotation = [0, 0, 0], tint, scale }) {
  // The campaign uses the same licensed furniture and measured support surfaces.
  // Legacy pieces remain only for background architecture without an equivalent.
  if(model==='desk.glb')return <DetailProp asset="metal_office_desk" height={DESK_TOP} position={position} rotation={rotation}/>;
  if(model==='chairDesk.glb')return <DetailProp asset="office_chair" height={1.168*DESK_SEAT/.618} position={position} rotation={rotation}/>;
  if(['chair.glb','chairCushion.glb'].includes(model))return <DetailProp asset="plastic_monobloc_chair_01" position={position} rotation={rotation}/>;
  if(model==='loungeSofa.glb')return <DetailProp asset="sofa_03" position={position} rotation={rotation}/>;
  if(model==='loungeChair.glb')return <DetailProp asset="modern_arm_chair_01" position={position} rotation={rotation}/>;
  if(['bookcaseOpen.glb','bookcaseClosed.glb'].includes(model))return <ShelfContents position={position} rotation={rotation}/>;
  if(model==='sideTable.glb')return <DetailProp asset="side_table_01" height={.73038} position={position} rotation={rotation}/>;
  if(model==='lampRoundTable.glb')return <DetailProp asset="desk_lamp_arm_01" height={.89261*(scale??1.45)/3.1} position={position} rotation={rotation}/>;
  if(model==='lampRoundFloor.glb')return <DetailProp asset="floor_lamp" height={1.75} position={position} rotation={rotation}/>;
  if(['table.glb','tableCloth.glb','tableGlass.glb'].includes(model))return <DetailProp asset="dining_table" height={.77} position={position} rotation={rotation}/>;
  if(['pottedPlant.glb','plantSmall1.glb','plantSmall2.glb'].includes(model))return <DetailProp asset="potted_plant_02" height={model==='pottedPlant.glb'?1.1:.5} position={position} rotation={rotation}/>;
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

function Character({ label, clip = 'idle', position = [0, 0, 0], rotation = [0, 0, 0], footLift=0, onClick, focused = false, showLabel = true, labelOffsetY = 0, onMeasure, character }) {
  const [hover, setHover] = useState(false);
  return <group position={position} rotation={focused ? [0, 0, 0] : rotation}>
    <Actor character={character} pose={clip} footLift={footLift} focused={focused} speaking={focused} onMeasure={onMeasure} />
    <mesh position={[0, 0.9, 0]} onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={() => { setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}>
      <cylinderGeometry args={[0.5, 0.5, 1.9, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    {showLabel && <Html position={[0, 2.1 + labelOffsetY, 0]} center zIndexRange={[30, 0]}>
      <button className="hotspot" style={labelStyle({ hover })} onClick={onClick}>{clampLabel(label)}</button>
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

function CharacterHotspot({ hotspot, position, hot, rotation, pose='idle', labelOffsetY = 0 }) {
  return <Character character={hotspot.character} clip={pose} footLift={pose==='sit'?seatContact(hotspot.character,DESK_SEAT,0).footLift:0} label={hotspot.label} position={pose==='sit'?position:[position[0], .003, position[2]]}
    rotation={rotation ?? [0, -0.5, 0]} focused={hot.focusId === hotspot.character}
    showLabel={hot.focusId !== hotspot.character} labelOffsetY={labelOffsetY}
    onMeasure={(height) => hot.onMeasure(hotspot.character, height)}
    onClick={() => hot.onCharacter?.(hotspot)} />;
}

function HotspotMarkers({ room, hot }) {
  {
    const groups=new Map();
    const anchors=room.id==='parth_room'?PARTH_ANCHORS:DETAIL_ANCHORS[room.id]??{};
    const characters=(room.hotspots??[]).filter(h=>h.type==='character');
    for(const h of room.hotspots??[]){if(h.type==='character')continue;const position=anchors[h.id]??hotspotPosition(h,0);const key=position[0]+':'+position[2];if(!groups.has(key))groups.set(key,{position,hotspots:[]});groups.get(key).hotspots.push(h);}
    return <>{characters.map(h=>{const officer=room.id==='police_station'&&h.character==='officer';return <CharacterHotspot key={h.id} hotspot={h} position={officer?[POLICE.officer[0],DESK_SEAT-.4915,POLICE.officer[1]]:hotspotPosition(h)} hot={hot} pose={officer?'sit':'idle'} rotation={h.rotation??[0,0,0]}/>;})}{[...groups.entries()].map(([key,group])=><AnchoredHotspot key={key} {...group} hot={hot} avoidLabelOverlap={room.id==='abandoned_field'&&group.hotspots.some(h=>h.id==='af_backpack')}/>)}</>;
  }
}

function AnchoredHotspot({hotspots,position,hot,avoidLabelOverlap=false}) {
  const [orbitShiftY,setOrbitShiftY]=useState(0),wasOverlapping=useRef(false),appliedShiftY=useRef(0);
  const {size}=useThree();
  const sedanLabel=useRef(new THREE.Vector3()),backpackLabel=useRef(new THREE.Vector3());
  useFrame(({camera})=>{
    if(!avoidLabelOverlap)return;
    const sedan=DETAIL_ANCHORS.abandoned_field.af_sedan;
    sedanLabel.current.set(sedan[0],sedan[1]+.28,sedan[2]).project(camera);
    backpackLabel.current.set(position[0],position[1]+.28,position[2]).project(camera);
    const next=updateFieldBackpackOrbit({
      screenDx:Math.abs(sedanLabel.current.x-backpackLabel.current.x)*size.width/2,
      screenDy:(sedanLabel.current.y-backpackLabel.current.y)*size.height/2,
      viewportWidth:size.width,
    },wasOverlapping.current);
    wasOverlapping.current=next.overlapping;
    if(Math.abs(next.shiftY-appliedShiftY.current)>2){
      appliedShiftY.current=next.shiftY;
      setOrbitShiftY(next.shiftY);
    }
  });
  const open=h=>h.type==='puzzle'?hot.onPuzzle?.(h):h.type==='travel'?hot.onTravel?.(h):hot.onClue?.(h);
  return <group position={position}><Html position={[0,.28,0]} center zIndexRange={[30,0]}><div className="object-actions" style={orbitShiftY?{transform:`translateY(${orbitShiftY}px)`}:undefined}>{hotspots.map(h=>{const solved=(hot.solvedPuzzles??[]).includes(h.puzzle),found=(hot.state.discovered??[]).includes(h.clue);return <button key={h.id} className="object-anchor" disabled={solved} onClick={()=>open(h)}>{h.label}{found||solved?' ✓':''}</button>;})}</div></Html><mesh onClick={e=>{e.stopPropagation();open(hotspots[0]);}}><sphereGeometry args={[.045,12,8]}/><meshStandardMaterial color="#d4b67c" emissive="#b39256" emissiveIntensity={.4}/></mesh></group>;
}

// ---------- room shell ----------

function RoomCeiling({width,depth,height}) {
 const ceiling=useRef();
 // Exploration is a cutaway view from outside the front wall. A ceiling must
 // not cover half that view; it reappears for cameras genuinely inside a room.
 useFrame(({camera})=>{if(ceiling.current)ceiling.current.visible=Math.abs(camera.position.z)<depth/2&&Math.abs(camera.position.x)<width/2&&camera.position.y<height-.25;});
 return <mesh ref={ceiling} position={[0,height,0]} rotation-x={Math.PI/2}><planeGeometry args={[width,depth]}/><meshStandardMaterial color="#c5bfae" roughness={1}/></mesh>;
}

function RoomFront({width,depth,height,tint}) {
 const front=useRef();
 useFrame(({camera})=>{if(front.current)front.current.visible=camera.position.z<depth/2-.3;});
 return <group ref={front} position={[0,0,depth/2]}>
  {[-1,1].map(side=><mesh key={side} position={[side*(width/4+.325),height/2,0]} rotation-y={Math.PI} receiveShadow><planeGeometry args={[width/2-.65,height]}/><meshStandardMaterial color={tint} roughness={.95}/></mesh>)}
  <mesh position={[0,2.3+(height-2.3)/2,0]} rotation-y={Math.PI}><planeGeometry args={[1.3,height-2.3]}/><meshStandardMaterial color={tint}/></mesh>
  <mesh position={[0,1.1,.02]} rotation-y={Math.PI}><planeGeometry args={[1.24,2.2]}/><meshStandardMaterial color="#423a32" roughness={.8}/></mesh>
 </group>;
}

function Shell({ width, depth, height, tint, painted=false, backOpening }) {
  const plaster = useTexture(`${ASSETS}/env/plaster_diff_1k.jpg`);
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  plaster.repeat.set(5, 2);

  return (
    <group>
      {backWallPanels(width,height,backOpening).map((panel,i)=><mesh key={`back-${i}`} position={[panel.centerX,panel.centerY,-depth/2]} receiveShadow>
        <planeGeometry args={[panel.width,panel.height]} />
        <meshStandardMaterial map={painted?null:plaster} color={tint} roughness={0.95} />
      </mesh>)}
      <mesh position={[-width / 2, height / 2, 0]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={painted?null:plaster} color={tint} roughness={0.95} />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={painted?null:plaster} color={tint} roughness={0.95} />
      </mesh>
      {[-depth / 2 + 0.04, depth / 2 - 0.04].map((zz) => (
        <mesh key={zz} position={[0, 0.14, zz]}>
          <boxGeometry args={[width, 0.28, 0.09]} />
          <meshStandardMaterial color="#171310" roughness={0.7} />
        </mesh>
      ))}
      <RoomCeiling width={width} depth={depth} height={height}/>
      <RoomFront width={width} depth={depth} height={height} tint={tint}/>
    </group>
  );
}

function Floor({ width, depth, repeat = [7, 5], color = '#b09070', tiled=false }) {
  // useTexture hands back process-wide cached textures; clone per surface so a
  // repeat change in one room never leaks into another room still mounted.
  const sources = useTexture(
    tiled
      ? [`${ASSETS}/env/tiles_Diffuse.jpg`, `${ASSETS}/env/tiles_nor_gl.jpg`]
      : [`${ASSETS}/env/parquet_diff_1k.jpg`]
  );
  // Anisotropic filtering is one of the cheapest fill-rate savings on weak
  // GPUs, so the preset scales it instead of always paying for 8x.
  const { quality } = useSettings();
  const anisotropy = quality === 'high' ? 8 : quality === 'medium' ? 4 : 1;
  const textures = useMemo(
    () =>
      sources.map((source) => {
        const texture = source.clone();
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat[0], repeat[1]);
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
        return texture;
      }),
    [sources, repeat[0], repeat[1], anisotropy]
  );
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);
  const [map, normal] = textures;
  map.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial map={map} normalMap={normal ?? null} normalScale={tiled?[.3,.3]:[1,1]} color={color} roughness={0.92} />
    </mesh>
  );
}

// ---------- kit primitives ----------

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

function NightSky() {
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;
    const ctx=canvas.getContext('2d');
    const sky=ctx.createLinearGradient(0,0,0,1024);
    sky.addColorStop(0,'#101b31');sky.addColorStop(.42,'#263b51');sky.addColorStop(.69,'#7b8790');sky.addColorStop(.8,'#46525a');sky.addColorStop(1,'#18222b');
    ctx.fillStyle=sky;ctx.fillRect(0,0,2048,1024);
    const glow=ctx.createRadialGradient(1024,730,4,1024,730,510);
    glow.addColorStop(0,'rgba(235,184,127,.36)');glow.addColorStop(1,'rgba(202,166,120,0)');ctx.fillStyle=glow;ctx.fillRect(0,220,2048,800);
    let seed=78123;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<260;i++){const y=25+random()*510;ctx.globalAlpha=.22+random()*.48;ctx.fillStyle=i%7?'#dce5ee':'#f2d6a2';ctx.beginPath();ctx.arc(random()*2048,y,.45+random()*1.05,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
  },[]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <>
    <color attach="background" args={['#26394e']}/>
    <mesh scale={[95,95,95]} renderOrder={-10}>
      <sphereGeometry args={[1,48,32]}/><meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} toneMapped={false}/>
    </mesh>
    <Moon position={[-8,13,-42]} size={1.35}/>
  </>;
}

function FileStack({ position }) {
  return (
    <group position={position}>
      {[0, 0.055, 0.11, 0.165].map((y, i) => (
        <mesh key={y} position={[(i % 2 ? -1 : 1) * 0.015, y+.025, (i % 2 ? 1 : -1) * 0.01]} rotation-y={i * 0.12}>
          <boxGeometry args={[0.4, 0.05, 0.3]} />
          <meshStandardMaterial color={i % 2 ? '#cfc6ae' : '#bdb49c'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Bed({ position, rotation = [0, 0, 0], made = true }) {
  return <DetailProp asset="bed" position={position} rotation={rotation}/>;
}
function Laptop({ position, rotation = [0, 0, 0], open = true }) {
  return <DetailProp asset="classic_laptop" position={position} rotation={rotation} scale={.9}/>;
}
function CRT({ position, rotation = [0, 0, 0], color = '#9fd2ff', glow = '#6aa9e8' }) {
  return <group position={position} rotation={rotation}><DetailProp asset="monitor"/><DetailProp asset="keyboard" position={[0,0,.34]}/><DetailProp asset="mouse" position={[.35,0,.35]}/></group>;
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

// ---------- interactive room kits ----------

function GazeboRoom({room,hot}) {
  return <group>
    <ParkGround />
    <CinemaProp asset="gazebo" position={[0,0,0]} height={3.32}/>
    <CinemaProp asset="painted_wooden_bench" position={PARK.bench} height={.615} width={1.9} rotation={[0,Math.PI,0]}/>
    <CinemaProp asset="painted_wooden_bench" position={[-3.4,0,2.6]} height={.615} width={1.9} rotation={[0,.5,0]}/>
    <CinemaProp asset="painted_wooden_bench" position={[3.6,0,2.2]} height={.615} width={1.9} rotation={[0,-.7,0]}/>
    {/* These are wall lanterns: the brackets attach to the gazebo's side columns. */}
    <CinemaProp asset="street_lamp_02" position={[-2.06,1.65,0]} height={.65} rotation={[0,-Math.PI/2,0]}/>
    <CinemaProp asset="street_lamp_02" position={[2.06,1.65,0]} height={.65} rotation={[0,Math.PI/2,0]}/>
    <pointLight position={[0,2.6,0]} color="#ffca8b" intensity={8} distance={7}/>
    <pointLight position={[-2.25,2.1,.1]} color="#ffca8b" intensity={3} distance={5}/>
    <pointLight position={[2.25,2.1,.1]} color="#ffca8b" intensity={3} distance={5}/>
    <WindTree position={[-4.5,0,-4.5]} height={5.2}/>
    <WindTree position={[4.5,0,-4]} height={5.5} rotation={[0,1.4,0]}/>
    <WindTree position={[-1.6,0,-7.3]} height={6}/>
    {[-22,-14,-6,3,12,21].map((x,i)=><CinemaProp key={x} asset="tree_background" position={[x,0,-20-(i%2)*3]} height={10+(i%3)} rotation={[0,i*.9,0]}/>)}
    <HotspotMarkers room={room} hot={hot}/>
  </group>;
}

function HomeRoom({room,hot}) {
 // The mezzanine walls run from the stair landing surface to the hall ceiling.
 const bedroomWallCenter=(HOME_STAIRS.top+HOME_BEDROOM.ceilingY)/2;
 const bedroomWallHeight=HOME_BEDROOM.ceilingY-HOME_STAIRS.top;
 return <group>
  <Shell width={13} depth={11} height={5.65} tint="#bcaa91" painted backOpening={HOME_UPPER_DOORWAY}/>
  <Floor width={13} depth={11} repeat={[6,5]} color="#dcc9ae"/>
  <DetailProp asset="sofa_03" position={[-4.55,0,.3]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="modern_arm_chair_01" position={[-2.5,0,-1.3]} rotation={[0,.28,0]}/>
  <Prop model="rugRectangle.glb" position={[-3.3,.003,.6]} scale={3.1} tint="#647171"/>
  <DetailProp asset="modern_coffee_table_01" position={[-2.8,.015,.9]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="binder_notebook" position={[-2.8,.405,.9]} scale={.65}/>
  <DetailProp asset="cup" position={[-2.25,.405,.88]}/>
  <DetailProp asset="side_table_01" position={[-4.5,0,-1.55]}/>
  <DetailProp asset="desk_lamp_arm_01" position={[-4.5,.55066,-1.55]} scale={.65}/>
  <pointLight position={[-4.3,1.05,-1.45]} color="#ffce94" intensity={5} distance={6}/>
  <ShelfContents position={[-3.8,0,-4.9]}/>
  <DetailProp asset="potted_plant_02" position={[-5.5,0,3.5]} height={1.15}/>
  <DetailProp asset="metal_office_desk" position={[2.55,0,-2.6]}/>
  <DetailProp asset="portable_cassette_player" position={[2.7,.7875,-2.6]} scale={1.2}/>
  <DetailProp asset="book_encyclopedia_set_01" position={[2,.7875,-2.65]} scale={.7}/>
  <Picture src={`${ASSETS}/pictures/evidence_gone_poster.jpg`} position={[-1.35,1.75,-5.42]} width={.72} height={1.05}/>
  <WallSign position={[-4.45,2.85,-5.42]} title="OUR FAMILY" lines={['A home full of memories']} width={1.8} height={.5}/>
  <DetailProp asset="wall_clock" position={[.6,2.35,-5.42]}/>
  <Window position={[-6.44,1.9,1.1]} rotation={[0,Math.PI/2,0]} width={2.2} height={1.8} moon={false}/>
  <DetailProp asset="curtains" position={[-6.35,.45,1.1]} rotation={[0,Math.PI/2,0]} height={2.55}/>
  {/* The imported stair's measured 2.8 m top tread meets a continuous landing. */}
  <DetailProp asset="stairs" position={[4.7,0,.65]} rotation={[0,Math.PI/2,0]}/>
  <mesh position={[HOME_STAIRS.landingCenter[0],HOME_STAIRS.landingY,HOME_STAIRS.landingCenter[1]]} receiveShadow castShadow><boxGeometry args={HOME_STAIRS.landingSize}/><meshStandardMaterial color="#ac8e68" roughness={.8}/></mesh>
  {/* The hall meets a real aperture in the rear wall, with a bedroom beyond. */}
  <mesh position={[HOME_UPPER_DOORWAY.centerX-HOME_UPPER_DOORWAY.width/2,HOME_UPPER_DOORWAY.bottomY+HOME_UPPER_DOORWAY.height/2,-5.52]}><boxGeometry args={[.12,HOME_UPPER_DOORWAY.height,.16]}/><meshStandardMaterial color="#c8b699"/></mesh>
  <mesh position={[HOME_UPPER_DOORWAY.centerX+HOME_UPPER_DOORWAY.width/2,HOME_UPPER_DOORWAY.bottomY+HOME_UPPER_DOORWAY.height/2,-5.52]}><boxGeometry args={[.12,HOME_UPPER_DOORWAY.height,.16]}/><meshStandardMaterial color="#c8b699"/></mesh>
  <mesh position={[HOME_UPPER_DOORWAY.centerX,HOME_UPPER_DOORWAY.bottomY+HOME_UPPER_DOORWAY.height+.045,-5.52]}><boxGeometry args={[HOME_UPPER_DOORWAY.width+.12,.09,.16]}/><meshStandardMaterial color="#c8b699"/></mesh>
  <mesh position={[HOME_STAIRS.upperCenter[0],HOME_STAIRS.landingY,HOME_STAIRS.upperCenter[1]]} receiveShadow><boxGeometry args={HOME_STAIRS.upperSize}/><meshStandardMaterial color="#ac8e68"/></mesh>
  {/* One continuous upper floor crosses the threshold into the bedroom. */}
  <mesh position={[HOME_BEDROOM.centerX,HOME_STAIRS.landingY,HOME_BEDROOM.centerZ]} receiveShadow><boxGeometry args={[HOME_BEDROOM.width,.14,HOME_BEDROOM.depth]}/><meshStandardMaterial color="#ac8e68" roughness={.8}/></mesh>
  <mesh position={[HOME_BEDROOM.centerX,bedroomWallCenter,HOME_BEDROOM.centerZ-HOME_BEDROOM.depth/2+.08]} receiveShadow><boxGeometry args={[HOME_BEDROOM.width,bedroomWallHeight,.16]}/><meshStandardMaterial color="#bcaa91"/></mesh>
  <mesh position={[HOME_BEDROOM.centerX-HOME_BEDROOM.width/2+.08,bedroomWallCenter,HOME_BEDROOM.centerZ]} receiveShadow><boxGeometry args={[.16,bedroomWallHeight,HOME_BEDROOM.depth-.15]}/><meshStandardMaterial color="#bcaa91"/></mesh>
  <mesh position={[HOME_BEDROOM.centerX+HOME_BEDROOM.width/2-.08,bedroomWallCenter,HOME_BEDROOM.centerZ]} receiveShadow><boxGeometry args={[.16,bedroomWallHeight,HOME_BEDROOM.depth-.15]}/><meshStandardMaterial color="#bcaa91"/></mesh>
  <mesh position={[HOME_BEDROOM.centerX,HOME_BEDROOM.ceilingY,HOME_BEDROOM.centerZ]} rotation-x={Math.PI/2}><planeGeometry args={[HOME_BEDROOM.width,HOME_BEDROOM.depth]}/><meshStandardMaterial color="#c5bda9" roughness={1}/></mesh>
  <Bed position={HOME_BEDROOM.bed}/>
  <ShelfContents position={HOME_BEDROOM.shelf}/>
  <DetailProp asset="bedside_cabinet" height={.67} position={HOME_BEDROOM.nightstand}/>
  <DetailProp asset="desk_lamp_arm_01" position={[HOME_BEDROOM.nightstand[0],HOME_BEDROOM.nightstand[1]+.55,HOME_BEDROOM.nightstand[2]]} scale={.62}/>
  <DetailProp asset="cardboard_box_01" position={HOME_BEDROOM.box} scale={.7}/>
  <WallSign position={[5.9,4.8,-5.42]} title="PARTH" width={.72} height={.23}/>
  <pointLight position={[5.25,5,-7.1]} color="#ffd8a9" intensity={12} distance={7}/>
  <pointLight position={[0,3.1,1.8]} color="#f5dbb7" intensity={12} distance={12}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function PoliceStationRoom({ room, hot }) {
  return <group>
    <Shell width={12} depth={10} height={3.4} tint="#8fa9b5" painted/>
    <Floor width={12} depth={10} repeat={[6,5]} color="#c6ced0" tiled/>
    <Picture src="/assets/signs/police.svg" position={[0,2.45,-4.94]} width={3.7} height={.82}/>
    <Picture src="/assets/signs/noticeboard.svg" position={[-3.8,1.85,-4.92]} width={1.65} height={1.2}/>
    <Picture src="/assets/signs/duty.svg" position={[3.8,2.5,-4.92]} width={1.65} height={.9}/>
    <Prop model="desk.glb" position={POLICE.desk} tint="#75858d" />
    <Prop model="chairDesk.glb" position={POLICE.chair} tint="#344c5a" />
    <FileStack position={[-.43,DESK_TOP,-1.05]} />
    <Prop model="lampRoundTable.glb" position={[.43,DESK_TOP,-1.18]} tint="#8caba6" scale={1.35}/>
    <Prop model="desk.glb" position={[-3.5,0,-2.4]} tint="#75858d"/>
    <Prop model="chairDesk.glb" position={[-3.5,0,-3.35]} tint="#344c5a"/>
    <FileStack position={[-3.8,DESK_TOP,-2.4]}/>
    <DetailProp asset="filing_cabinet" position={[4.7,0,-3.6]}/>
    <DetailProp asset="filing_cabinet" position={[3.35,0,-3.6]}/>
    <DetailProp asset="monitor" position={[-3.4,DESK_TOP,-2.5]}/>
    <DetailProp asset="keyboard" position={[-3.4,DESK_TOP,-2.1]}/>
    <DetailProp asset="clipboard" position={[-.1,DESK_TOP,-.91]} scale={.65}/>
    <DetailProp asset="pencil_cup" position={[.66,DESK_TOP,-1.05]}/>
    <DetailProp asset="office_phone" position={[-.61,DESK_TOP,-1.05]} scale={.8}/>
    <WallSign position={[0,1.6,-4.93]} width={1.3} height={.3} title="DUTY OFFICER"/>
    <WallSign position={[-5.93,2.2,1.4]} rotation={[0,Math.PI/2,0]} width={1.8} height={.55} title="PUBLIC ASSISTANCE" lines={['WAIT HERE FOR THE DUTY OFFICER']}/>
    {[-.85,0,.85].map(x=><Prop key={x} model="chair.glb" position={[-4.1+x,0,1.7]} tint="#627885"/>)}
    <Prop model="pottedPlant.glb" position={[4.7,0,2.5]}/>
    <Window position={[-5.94,1.85,-.5]} rotation={[0,Math.PI/2,0]}/>
    <Fluorescent position={[0,3.1,-1]}/><Fluorescent position={[-3.4,3.1,1.5]}/>
    <pointLight position={[0,2.7,-.7]} color="#e4f5ff" intensity={12} distance={10}/>
    <HotspotMarkers room={room} hot={hot}/>
  </group>;
}

function BedroomWorkstation({paused}) {
  return <group>
    <Prop model="desk.glb" position={BEDROOM.desk} rotation={[0,-Math.PI/2,0]}/>
    <Prop model="chairDesk.glb" position={BEDROOM.chair} rotation={[0,Math.PI/2,0]}/>
    <Laptop position={BEDROOM.laptop} rotation={[0,-Math.PI/2,0]}/>
    <Prop model="lampRoundTable.glb" position={BEDROOM.lamp} scale={1.45}/>
    <CeilingFan position={[0,3.2,0]} paused={paused}/>
    <pointLight position={[2.8,1.12,-2.08]} color="#ffd28a" intensity={5} distance={5}/>
    <DetailProp asset="pencil_cup" position={[2.85,DESK_TOP,-.93]}/>
    <DetailProp asset="binder_notebook" position={[2.75,DESK_TOP,-1.99]} scale={.5}/>
    <Cable points={[[2.85,DESK_TOP,-1.7],[3.14,.68,-1.7],[3.17,.09,-1.7],[4.92,.07,-1.7]]}/>
  </group>;
}
function SameerRoomScene({ room, hot, paused=false, phase }) {
  const maskVisible=phase==='mask_reveal'||(phase!=='mask_taken'&&['act7','act8'].includes(hot.state?.act));
  return <group>
    <Shell width={10} depth={8} height={3.2} tint="#786957" painted/>
    <Floor width={10} depth={8} repeat={[5,4]}/>
    <Bed position={SAMEER_BED.center}/>
    {maskVisible&&<DemonMask position={[SAMEER_BED.center[0],SAMEER_BED.surfaceY+.018,SAMEER_BED.center[2]]} rotation={[-Math.PI/2,0,0]} scale={.95}/>}
    <BedroomWorkstation paused={paused}/>
    <Prop model="bookcaseOpen.glb" position={[-3.8,0,-3.25]}/>
    <Window position={[4.95,1.75,-1.6]} rotation={[0,-Math.PI/2,0]}/>
    <DetailProp asset="curtains" position={[4.84,.45,-1.6]} rotation={[0,-Math.PI/2,0]} height={2.25}/>
    <DetailProp asset="bedside_cabinet" height={.67} position={[-1.55,0,-2]}/>
    <DetailProp asset="cup" position={[-1.55,.67,-2]}/>
    <DetailProp asset="floor_lamp" position={[-4.2,0,1.8]} height={1.75}/>
    <WallSign position={[-4.94,1.85,-1.2]} rotation={[0,Math.PI/2,0]} width={1.05} height={1.45} title="STAY CURIOUS" lines={['LOOK CLOSER','QUESTION EVERYTHING']} background="#23404c"/>
    <WallSign position={[-4.94,1.6,.6]} rotation={[0,Math.PI/2,0]} width={.75} height={1} title="APOGEE" lines={['LIVE IN CONCERT']} background="#3b2830"/>
    <DetailProp asset="cardboard_box_01" position={[-4.3,0,2.4]} scale={.8}/>
    <pointLight position={[-3,2.4,1.3]} color="#f7d7aa" intensity={9} distance={7}/>
    <HotspotMarkers room={room} hot={hot}/>
  </group>;
}

function ParthRoomScene({ room, hot, paused=false }) {
  return <group>
    <Shell width={10} depth={8} height={3.2} tint="#8a7867" painted/>
    <Floor width={10} depth={8} repeat={[5,4]}/>
    <Bed position={[-2.15,0,-.3]} made={false}/>
    <BedroomWorkstation paused={paused}/>
    <Prop model="bookcaseOpen.glb" position={BEDROOM.shelf}/>
    <Prop model="sideTable.glb" position={[-.8,0,-1.5]}/>
    <Prop model="pottedPlant.glb" position={[4.1,0,-3.3]} scale={2}/>
    <Window position={[4.95,1.8,-1.2]} rotation={[0,-Math.PI/2,0]}/>
    <DetailProp asset="curtains" position={[4.84,.45,-1.2]} rotation={[0,-Math.PI/2,0]} height={2.25}/>
    <DetailProp asset="binder_notebook" position={[-3.42,1.285,-2.65]} scale={.6}/>
  <DetailProp asset="portable_cassette_player" position={[-.8,.73038,-1.5]} scale={.9}/>
  <DetailProp asset="bedside_cabinet" position={[-.92,0,.76]} height={.67}/>
  <DetailProp asset="desk_lamp_arm_01" position={[-.92,.55066,.76]} scale={.62}/>
  <DetailProp asset="book_encyclopedia_set_01" position={[-.92,.55066,1.08]} scale={.6}/>
  <DetailProp asset="pencil_cup" position={[3.55,DESK_TOP,-1.98]} scale={.85}/>
  <DetailProp asset="star_chart" position={[1.95,DESK_TOP,-1.98]} scale={.62}/>
  <DetailProp asset="cardboard_box_01" position={[-4.2,0,-.6]} scale={.78}/>
  <DetailProp asset="cardboard_box_01" position={[-3.78,.342,-.6]} scale={.67}/>
  <WallSign position={[4.94,2.35,.9]} rotation={[0,-Math.PI/2,0]} width={1.35} height={.55} title="APOGEE / 2019" lines={['FIRST SHOW • FRONT ROW']} background="#263c43"/>
    <DetailProp asset="cardboard_box_01" position={[-4.25,0,2.6]}/>
    <WallSign position={[-.5,2.3,-3.93]} width={1.6} height={.6} title="THE MOON'S DARK SIDE" lines={['NOT EVERYTHING IS AS IT SEEMS']} background="#263c43"/>
    <pointLight position={[-2,2.7,1]} color="#ecd4b8" intensity={9} distance={8}/>
    <Picture src={`${ASSETS}/pictures/evidence_gone_poster.jpg`} position={[-4.94,1.85,.9]} rotation={[0,Math.PI/2,0]} width={.9} height={1.3}/>
    <HotspotMarkers room={room} hot={hot}/>
  </group>;
}

function FieldOvergrowth(){
 const plants=useMemo(()=>FIELD_OVERGROWTH,[]);
 return <>{['grass_medium_01_large_a_LOD0','grass_medium_01_tall_a_LOD0'].map(part=><InstancedDetailScatter key={part} asset="grass_medium_01" part={part} placements={plants.filter(plant=>plant.part===part)}/>)}</>;
}

function AbandonedFieldRoom({ room, hot }) {
  return <group>
   <NightSky/>
   <TerrainSurface width={70} depth={70}/>
   <TerrainSurface material="brown_mud_leaves_01" width={4.8} depth={30} position={[-1.4,.003,-7]} repeat={[1.8,8]} color="#967f68" trail/>
   <group position={[FIELD_TRACKS.center[0],.006,FIELD_TRACKS.center[1]]} rotation={[0,FIELD.yaw,0]}>
    {[-FIELD_TRACKS.offset,FIELD_TRACKS.offset].map(x=><TerrainSurface key={x} material="brown_mud_leaves_01" width={FIELD_TRACKS.width} depth={FIELD_TRACKS.length} position={[x,0,0]} repeat={[1,3]} color="#817461" trail/>)}
   </group>
   <group position={FIELD.car} rotation={[0,FIELD.yaw,0]}>
    <DetailProp asset="sedan_detailed"/>
    <DetailProp asset="backpack" position={FIELD.seat} height={.38} rotation={[0,-Math.PI/2,0]}/>
    <WallSign position={[2.307,.697,0]} rotation={[0,Math.PI/2,0]} width={.39} height={.084} title="KA01OC1808" background="#dddac8" ink="#1b2325"/>
   </group>
   <FieldOvergrowth/>
   {Array.from({length:8},(_,i)=>{const side=i%2?-1:1,x=side*(5.2+(i*13%22)/5),z=-9+(i*17%60)/5;return <DetailProp key={`weed-${i}`} asset="weed_plant_02" position={[x,.006,z]} rotation={[0,i*1.73,0]} scale={.9+(i%3)*.2}/>;})}
   {Array.from({length:10},(_,i)=><DetailProp key={i} asset="rock_09" position={[(i%2?-1:1)*(3.5+i%5),.006,-5+i*.72]} scale={2.5+(i%3)} rotation={[0,i*.7,0]}/>)}
   {[-8.05,-6.55,-5.05,-3.55,-2.05,-.55,.95,2.45,3.95,5.45,6.95,8.45].map(x=><FencePanel key={x} position={[x,0,-9]}/>)}
   {[-13,-9,-5,-1,3,7,11].map((x,i)=><CinemaProp key={x} asset="tree_background" position={[x,0,-14-(i%2)*3]} height={8+(i%4)} rotation={[0,i*.73,0]}/>)}
   <DetailProp asset="modular_factory_facade" {...FIELD_BACKGROUND_BUILDING} castShadow={false} receiveShadow={false}/>
   <WindTree position={[-7.2,0,-4.3]} height={5.5}/><WindTree position={[8,0,-5]} height={6}/>
   <DetailProp asset="old_tyre" position={[4.3,.005,-4]} rotation={[0,.6,0]}/>
   <DetailProp asset="can_rusted" position={[-3.5,.006,.2]} rotation={[0,1,0]}/>
   <DetailProp asset="cardboard_box_01" position={[4.1,.006,-3.1]} rotation={[0,.4,0]}/>
   <DetailProp asset="street_lamp_01" position={[6.5,0,1]} height={3.8}/>
   <pointLight position={[6.5,3.4,1]} color="#ffcf84" intensity={28} distance={16}/>
   <pointLight position={[.8,2.3,3.7]} color="#c7d7ed" intensity={15} distance={12}/>
   {[-.58,.58].map(x=><mesh key={x} position={[4.5+x,.57,-8.83]} castShadow><boxGeometry args={[.065,1.08,.065]}/><meshStandardMaterial color="#514335" roughness={.9}/></mesh>)}
   <WallSign position={[4.5,1.22,-8.82]} width={1.42} height={.62} title="PRIVATE LAND" lines={['NO ENTRY AFTER DARK']} background="#68583e" ink="#d9c9a2"/>
   <HotspotMarkers room={room} hot={hot}/>
  </group>;
}

function CyberCafeRoom({room,hot,paused=false}) {
 return <group>
  <Shell width={13} depth={11} height={3.4} tint="#92958b" painted/>
  <Floor width={13} depth={11} repeat={[6,5]} color="#aab5ac" tiled/>
  {[-3.1,-.35,2.4].map((x,i)=><ComputerStation key={x} position={[x,0,-3.45]} number={i+1} deskTint={['#8a6446','#73563d','#92704e'][i]}/>)}
  <DetailProp asset="counter" position={[-3.9,0,2]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="CashRegister_01" position={[-3.8,1.1275,1.05]} scale={.6} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="vintage_electric_kettle" position={[-3.9,1.1275,2.7]} scale={.85}/>
  <DetailProp asset="wooden_bowl_01" position={[-3.9,1.1275,2]} scale={.8}/>
  <DetailProp asset="cup" position={[-3.9,1.1275,3.05]} scale={1.1}/>
  <DetailProp asset="dining_table" position={[2.2,0,3.6]} height={.74}/>
  <DetailProp asset="wooden_bowl_01" position={[2.2,.74,3.52]} scale={.72}/>
  <DetailProp asset="cup" position={[2.45,.74,3.86]} scale={.8}/>
  {/* Two monobloc chairs face each other across the table's long sides. */}
  <DetailProp asset="plastic_monobloc_chair_01" position={[2.2,0,2.65]} rotation={[0,0,0]}/>
  <DetailProp asset="plastic_monobloc_chair_01" position={[2.2,0,4.55]} rotation={[0,Math.PI,0]}/>
  <WallSign position={[3.2,2.35,5.42]} width={1.2} height={.42} title="CAFÉ SEATING" lines={['PLEASE TAKE A TABLE']}/>
  {/* Manager's workstation: the desk opens towards the room (-x) so the chair
      tucks into the knee-hole; every item is placed in the desk's own frame. */}
  <group position={[4.7,0,-2.3]} rotation={[0,-Math.PI/2,0]}>
    <DetailProp asset="metal_office_desk"/>
    <DetailProp asset="monitor" position={[-.35,.7875,-.18]}/>
    <DetailProp asset="keyboard" position={[-.35,.7875,.18]}/>
    <DetailProp asset="mouse" position={[-.05,.7875,.2]}/>
    <DetailProp asset="printer" position={[.62,.7875,-.24]}/>
    <DetailProp asset="router" position={[.08,.7875,-.34]}/>
    <DetailProp asset="portable_cassette_player" position={[-.8,.7875,0]} scale={1.4}/>
    <DetailProp asset="binder_notebook" position={[.1,.7875,.02]} scale={.65}/>
    <DetailProp asset="office_chair" position={[0,0,.78]} rotation={[0,Math.PI,0]} height={1.168*.49035/.618}/>
  </group>
  <ShelfContents position={[5.65,0,1.3]} rotation={[0,-Math.PI/2,0]}/>
  <DetailProp asset="cardboard_box_01" position={[5.5,0,3.2]}/>
  <DetailProp asset="cardboard_box_01" position={[5.5,.342,3.2]} scale={.8}/>
  <WallSign position={[0,2.55,-5.42]} width={4.4} height={.85} title="RAMU'S CYBER CAFÉ" lines={['INTERNET • PRINTING • SCANNING']}/>
  <WallSign position={[-6.42,2,2]} rotation={[0,Math.PI/2,0]} width={2} height={1.05} title="DOSA CORNER" lines={['PLAIN DOSA   ₹40','MASALA DOSA   ₹60']}/>
  <WallSign position={[5,2.4,-5.42]} width={1.3} height={.65} title="HOUSE RULES" lines={['SAVE YOUR WORK','ASK RAMU FOR HELP']}/>
  <WallSign position={[-3.5,2.5,-5.42]} width={1.55} height={.58} title="RAMU'S DOSA CORNER" lines={['FRESH BATTER • FILTER COFFEE']}/>
  <DetailProp asset="wall_clock" position={[-4.8,2.55,-5.4]} height={.4}/>
  <CeilingFan position={[-1.9,3.15,-2]} paused={paused}/><CeilingFan position={[2.7,3.15,-2]} paused={paused}/>
  <Fluorescent position={[0,3.2,-3.8]}/><Fluorescent position={[0,3.2,1.7]}/>
  <Window position={[-6.44,1.8,-1.2]} rotation={[0,Math.PI/2,0]} width={2.2} height={1.6} moon={false}/>
  <DetailProp asset="potted_plant_02" position={[-5.5,0,4.3]} height={1.1}/>
  {/* The phone line leaves the wall jack, crosses the floor and climbs to the router. */}
  <Cable points={[[6.42,.85,-1.9],[6.42,.12,-1.9],[5.6,.055,-2.0],[5.2,.055,-2.1],[5.16,.5,-2.2],[5.04,.9,-2.22]]}/>
  <pointLight position={[0,2.25,-1.7]} color="#f1d8b8" intensity={5} distance={12}/>
  <pointLight position={[-4,2.1,2]} color="#ffd09a" intensity={7} distance={6}/>
  <pointLight position={[2.3,2.2,2.7]} color="#ffc47d" intensity={4} distance={6}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function ConcertRoom({room,hot}) {
 return <group>
  <TerrainSurface width={40} depth={36}/>
  <group position={[0,0,-5.5]}>
   <mesh position={[0,.4,0]} castShadow receiveShadow><boxGeometry args={[13,.8,4.5]}/><meshStandardMaterial color="#352d25" roughness={.85}/></mesh>
   <mesh position={[0,3.1,-2.12]}><planeGeometry args={[13,4.6]}/><meshStandardMaterial color="#25333b" roughness={.9}/></mesh>
   <WallSign position={[0,3.55,-2.08]} width={5} height={1.2} title="APOGEE" lines={['LIVE / A PERIGEE EVENT']} background="#21343d"/>
   {[-5.8,5.8].map(x=><mesh key={x} position={[x,2.2,-1.8]}><boxGeometry args={[.16,4.4,.16]}/><meshStandardMaterial color="#787e83" metalness={.7}/></mesh>)}
   <mesh position={[0,4.35,-1.8]}><boxGeometry args={[11.8,.16,.16]}/><meshStandardMaterial color="#787e83" metalness={.7}/></mesh>
   {[-5.2,-2.6,0,2.6,5.2].map((x,i)=><TrussLight key={x} position={[x,4.1,-1.75]} color={['#ffdab0','#b5a0f8','#88c9e8','#efb786','#bb98e8'][i]}/>)}
   <DetailProp asset="amplifier" position={[-3.5,.8,-.7]} scale={1.7}/>
   <DetailProp asset="amplifier" position={[3.5,.8,-.7]} scale={1.7}/>
   <DetailProp asset="mic_stand" position={[0,.8,.8]} height={1.65}/>
   <DetailProp asset="microphone" position={[0,2.43,.8]} scale={1.1} rotation={[Math.PI/2,0,0]}/>
   <DetailProp asset="metal_office_desk" position={[2.8,.8,-.15]}/>
   <DetailProp asset="synthesizer" position={[2.8,1.5875,-.15]} scale={1.8}/>
   <DetailProp asset="drum_pad" position={[-2.6,1.5875,-.15]} scale={1.4}/>
   <DetailProp asset="metal_office_desk" position={[-2.6,.8,-.15]}/>
   {[-2.4,2.4].map(x=><DetailProp key={x} asset="stage_monitor" position={[x,.8,1.65]} height={.5}/>)}
   <Cable points={[[0,.81,.8],[1.2,.81,.9],[3.2,.81,.8],[4.5,.81,-.9]]}/>
  </group>
  {[-6.8,6.8].map(x=><DetailProp key={x} asset="amplifier" position={[x,0,-3.5]} height={1.6}/>)}
  {[-1,1].flatMap(side=>[0,1,2,3].map(i=><CrowdBlob key={`${side}-${i}`} position={[side*(4+i%2),0,-.6+Math.floor(i/2)*1.7]} scale={.97}/>))}
  <FencePanel position={[-4.5,0,-2.6]} rotation={[0,.2,0]}/>
  <WallSign position={[-4.5,1.1,-2.42]} width={1.2} height={.45} title="BACKSTAGE" lines={['PASS HOLDERS ONLY']}/>
  <WallSign position={[5,1.4,-1]} width={1.15} height={.5} title="PERIGEE" lines={['MEMBER REGISTRATION']}/>
  {[-8.5,8.5].map(x=><group key={x}><DetailProp asset="street_lamp_01" position={[x,0,2.5]} height={3.8}/><pointLight position={[x,3.1,2.5]} color="#f6cc91" intensity={12} distance={10}/></group>)}
  <WindTree position={[-10,0,-7]} height={6}/><WindTree position={[10,0,-7]} height={6}/>
  <pointLight position={[0,4.3,-3.8]} color="#c2cef4" intensity={30} distance={14}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function EmergencyBeacon({position}) {
  const redBulb=useRef(),blueBulb=useRef(),redLight=useRef(),blueLight=useRef();
  useFrame(({clock})=>{const t=clock.elapsedTime;for(const [bulb,light,on] of [[redBulb,redLight,Math.sin(t*8)>0],[blueBulb,blueLight,Math.sin(t*8)<=0]]){if(bulb.current)bulb.current.material.emissiveIntensity=on?2.6:.18;if(light.current)light.current.intensity=on?3.5:.15;}});
  return <group position={position}>{[[redBulb,redLight,'#d83932',-.2],[blueBulb,blueLight,'#3983d8',.2]].map(([bulb,light,color,x])=><group key={color} position={[x,0,0]}><mesh ref={bulb}><boxGeometry args={[.26,.11,.13]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.2}/></mesh><pointLight ref={light} color={color} intensity={.2} distance={5}/></group>)}</group>;
}

function ConcertCaptureRoom({phase='capture'}) {
  const departing=phase==='departure';
  return <group>
    <NightSky/>
    <TerrainSurface material="brown_mud_leaves_01" width={34} depth={28} position={[0,.002,-2]} repeat={[12,8]} color="#777168"/>
    <TerrainSurface width={34} depth={34} position={[0,0,8]} repeat={[8,8]} color="#697168"/>
    <group position={departing?[.7,0,-4.2]:[-.5,0,-3.1]}>
      <DetailProp asset="cargo_van" height={2.5} rotation={[0,.08,0]}/>
      <WallSign position={[.4,1.47,1.31]} width={1.48} height={.38} title="SHASHDHAR EMS" lines={['EMERGENCY RESPONSE']} background="#e1ded2" ink="#9c302c"/>
      <mesh position={[1.5,1.48,1.322]}><boxGeometry args={[.52,.12,.018]}/><meshStandardMaterial color="#b33631" emissive="#36100e"/></mesh>
      <mesh position={[1.5,1.48,1.334]}><boxGeometry args={[.12,.52,.018]}/><meshStandardMaterial color="#b33631" emissive="#36100e"/></mesh>
      <EmergencyBeacon position={[0,2.62,0]}/>
      {[-2.25,2.25].map(x=><mesh key={x} position={[x,.71,1.23]}><boxGeometry args={[.21,.23,.035]}/><meshStandardMaterial color="#a83d33" emissive="#4d1512"/></mesh>)}
    </group>
    <DetailProp asset="hospital_bed" position={[3.3,0,-.6]} rotation={[0,-.22,0]}/>
    <DetailProp asset="medical_cart" position={[5.1,0,-2.8]} rotation={[0,-.2,0]}/>
    {[-8,-6,-4,-2,0,2,4,6,8].map(x=><FencePanel key={x} position={[x,0,-8.5]}/>)}
    <WallSign position={[-5.6,1.6,-8.42]} width={2.5} height={.62} title="APOGEE / SERVICE YARD" lines={['STAFF & VEHICLES ONLY']} background="#1e2b30"/>
    <DetailProp asset="metal_trash_can" position={[5.45,0,1.05]}/>
    <DetailProp asset="metal_trash_can" position={[7.05,0,1.9]} rotation={[0,-.3,0]}/>
    <DetailProp asset="cardboard_box_01" position={[4.55,0,.7]} scale={.8}/>
    <DetailProp asset="can_rusted" position={[4.7,.006,1.05]} rotation={[0,.6,0]} scale={1.4}/>
    <DetailProp asset="street_lamp_01" position={[-7,0,1]} height={3.8}/>
    <pointLight position={[-7,3,1]} color="#efc98d" intensity={16} distance={12}/>
    <pointLight position={[3,2,1]} color={departing?'#3b78b5':'#bd5945'} intensity={departing?8:4} distance={9}/>
    <WindTree position={[-10,0,-8]} height={7}/><WindTree position={[10,0,-8]} height={7}/>
  </group>;
}

function WorkshopRoom({room,hot}) {
 return <group>
  <TerrainSurface width={40} depth={40}/>
  <TerrainSurface material="brown_mud_leaves_01" width={5} depth={25} position={[-1,.003,5]} repeat={[1,8]} trail/>
  {[-3,.1,3.2].map(x=><DetailProp key={x} asset="dining_table" position={[x,0,-2.2]}/>)}
  <DetailProp asset="wooden_bowl_01" position={[.1,.877,-2.2]} scale={.9}/>
  <DetailProp asset="vintage_electric_kettle" position={[-.6,.877,-2.2]}/>
  <DetailProp asset="cup" position={[.65,.877,-2.2]} scale={1.1}/>
  <DetailProp asset="star_chart" position={[-3,.877,-2.2]}/>
  <DetailProp asset="eyepiece_case" position={[3.2,.877,-2.2]}/>
  {[-3.8,-2.2,2.4,4].map(x=><DetailProp key={x} asset="plastic_monobloc_chair_01" position={[x,0,-.9]} rotation={[0,Math.PI,0]}/>)}
  <DetailProp asset="telescope" position={[5,0,-3.5]} height={1.95} rotation={[0,-.4,0]}/>
  <DetailProp asset="telescope" position={[-5.6,0,-3.9]} height={1.7} rotation={[0,.7,0]}/>
  <DetailProp asset="cardboard_box_01" position={[4.7,0,-1.4]}/>
  <DetailProp asset="binder_notebook" position={[-3.75,.877,-2.2]} scale={.65}/>
  {[-6,6].map(x=><mesh key={x} position={[x,1.8,-5]}><cylinderGeometry args={[.05,.065,3.6,12]}/><meshStandardMaterial color="#6b604e"/></mesh>)}
  <StringLights from={[-6,3.5,-5]} to={[6,3.5,-5]} count={15}/>
  <WallSign position={[0,2.4,-5.15]} width={3.4} height={.75} title="PERIGEE / NIGHT SKY" lines={['LOOK UP. THERE IS MORE TO SEE.']}/>
  {[-9,-5,5,9].map((x,i)=><WindTree key={x} position={[x,0,-8-(i%2)*2]} height={5+i*.3}/>)}
  <pointLight position={[0,2.8,-2]} color="#e9c589" intensity={22} distance={10}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function NgoHqRoom({room,hot}) {
 return <group>
  <Shell width={18} depth={14} height={5} tint="#a39580" painted/>
  <Floor width={18} depth={14} repeat={[8,6]} color="#c3b294" tiled/>
  {[-6.3,6.3].map(x=><Column key={x} position={[x,0,-5.4]} height={5}/>)}
  <Emblem position={[0,3.05,-6.92]} radius={1.25}/>
  <WallSign position={[0,1.65,-6.9]} width={3.1} height={.6} title="PERIGEE FOUNDATION" lines={['REACH BEYOND THE ORDINARY']}/>
  <DetailProp asset="counter" position={[4.8,0,-2.5]}/>
  <DetailProp asset="monitor" position={[4.7,1.1275,-2.55]}/>
  <DetailProp asset="binder_notebook" position={[3.9,1.1275,-2.5]} scale={.75}/>
  <DetailProp asset="pencil_cup" position={[5.8,1.1275,-2.5]}/>
  <DetailProp asset="sofa_03" position={[-5.8,0,0]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="modern_coffee_table_01" position={[-4,0,0]}/>
  <DetailProp asset="binder_notebook" position={[-4,.39,0]} scale={.7}/>
  <ShelfContents position={[-7.8,0,-3.3]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="potted_plant_02" position={[-7.4,0,4]} height={1.4}/>
  <DetailProp asset="potted_plant_02" position={[7.4,0,4]} height={1.4}/>
  <WallSign position={[-4.4,2.3,-6.91]} width={2.1} height={1.1} title="PROGRAMMES" lines={['NIGHT SKY WORKSHOPS','COMMUNITY OUTREACH']}/>
  <WallSign position={[4.4,2.3,-6.91]} width={2.1} height={1.1} title="MEMBERSHIP" lines={['REGISTER AT RECEPTION','STAFF ACCESS BEYOND THIS POINT']}/>
  <DoorOpening position={[2.2,0,-4.6]} label="ARCHIVE / STAFF ONLY"/>
  <pointLight position={[0,3.6,-1]} color="#efd5aa" intensity={28} distance={16}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function NgoArchiveRoom({room,hot}) {
 return <group>
  <Shell width={12} depth={9} height={3.2} tint="#a29882" painted/>
  <Floor width={12} depth={9} repeat={[5,4]} color="#b8ab8f" tiled/>
  {[-4.7,-2.35,0,2.35,4.7].map((x,i)=><group key={x}><ShelfContents position={[x,0,-3.7]}/><WallSign position={[x,2.35,-4.42]} width={1.1} height={.3} title={`RECORDS / 0${i+1}`}/></group>)}
  <ShelfContents position={[-5.4,0,-1.2]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="filing_cabinet" position={[-4.8,0,1.2]}/>
  <DetailProp asset="filing_cabinet" position={[-3.75,0,1.2]}/>
  <DetailProp asset="cardboard_box_01" position={[-3.75,.7225,1.2]} scale={.8}/>
  <DetailProp asset="cardboard_box_01" position={[-5.05,0,3]}/>
  <Prop model="desk.glb" position={[2.9,0,-1.6]} rotation={[0,-Math.PI/2,0]}/>
  <CRT position={[2.9,DESK_TOP,-1.85]} rotation={[0,-Math.PI/2,0]}/>
  <Prop model="chairDesk.glb" position={[1.7,0,-1.7]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="binder_notebook" position={[2.9,DESK_TOP,-.97]} scale={.65}/>
  <Prop model="lampRoundTable.glb" position={[2.9,DESK_TOP,-2.21]}/>
  <WallSign position={[-5.91,1.8,.8]} rotation={[0,Math.PI/2,0]} width={1.8} height={.6} title="ARCHIVE POLICY" lines={['NO RECORDS LEAVE THIS ROOM']}/>
  <Fluorescent position={[0,3.05,-1.8]}/>
  <pointLight position={[2.6,2.1,-1.6]} color="#f1d6a5" intensity={8} distance={6}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function HospitalRoom({room,hot,actId,phase,paused=false}) {
 if(actId==='act8'&&String(phase??'').startsWith('ending_'))return <HospitalEndingRoom phase={phase} paused={paused}/>;
 const ritual=['act6','act8'].includes(actId),cargo=actId==='act7';
 if(cargo)return <HospitalDispatch room={room} hot={hot} loading={phase==='cargo_loading'}/>;
 return <group>
  <Shell width={16} depth={10} height={3.4} tint="#b9c6c5" painted/>
  <Floor width={16} depth={10} repeat={[8,5]} color="#c8d3ce" tiled/>
  <WallSign position={[0,2.6,-4.93]} width={3.4} height={.7} title="SHASHDHAR HOSPITAL" lines={['WARD 03 / RESTRICTED ACCESS']} background="#325052" ink="#e4eee9"/>
  <DoorOpening position={[-5.8,0,-4.4]} label="SERVICE ACCESS"/>
  <DoorOpening position={[5.8,0,-4.4]} label="OPERATING THEATRE"/>
  {!cargo&&<DetailProp asset="hospital_bed" position={HOSPITAL_BED.center} rotation={[0,.08,0]}/>}
  <DetailProp asset="bedside_cabinet" position={[-6,0,-1.1]}/>
  <DetailProp asset="privacy_curtain" position={[-3,1.045,-2]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="medical_cart" position={[-5.8,0,1.3]}/>
  <DetailProp asset="nurse_station" position={[4.7,0,-2.2]}/>
  <DetailProp asset="monitor" position={[4.7,1.1175,-2.2]}/>
  <DetailProp asset="clipboard" position={[3.7,1.1175,-2.2]} scale={.6}/>
  <DetailProp asset="pencil_cup" position={[5.7,1.1175,-2.2]}/>
  <DetailProp asset="wheelchair_01" position={[6.1,0,.6]} rotation={[0,-.6,0]}/>
  {[4,5.15,6.3].map(x=><DetailProp key={x} asset="plastic_monobloc_chair_01" position={[x,0,3.2]} rotation={[0,Math.PI,0]}/>)}
  <DetailProp asset="filing_cabinet" position={[-7.4,0,-2.4]}/>
  {ritual&&<group>
   <DetailProp asset="dining_table" position={[0,0,-2.1]}/>
   <DetailProp asset="chest" position={[.6,.877,-2.1]} scale={.4}/>
   {[-.85,-.55,.9].map((x,i)=><Candle key={x} position={[x,.877,-2.1]} height={.24+i*.05}/>)}
   <WallSign position={[0,1.65,-4.91]} width={2.2} height={.65} title="PERIGEE" lines={['THE ASCENSION']} background="#493138"/>
   <pointLight position={[0,1.7,-2.1]} color="#dc916e" intensity={5} distance={7}/>
  </group>}
  <WallSign position={[-7.93,2,1]} rotation={[0,Math.PI/2,0]} width={1.8} height={.55} title="WARD 03" lines={['KEEP THE CORRIDOR CLEAR']}/>
  <WallSign position={[7.93,2,1]} rotation={[0,-Math.PI/2,0]} width={1.8} height={.55} title="SECURITY" lines={['AUTHORISED STAFF ONLY']}/>
  <Fluorescent position={[-3,3.3,-1]}/><Fluorescent position={[3,3.3,-1]} delay={3.2}/><Fluorescent position={[0,3.3,2.2]} delay={1.4}/>
  <pointLight position={[0,2.25,.3]} color="#e1eeef" intensity={7} distance={14}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function FireWindow({paused=false}) {
 const glow=useRef();
 useFrame(({clock})=>{if(!paused&&glow.current){const t=clock.elapsedTime;glow.current.intensity=5.5+Math.sin(t*8.1)*1.1+Math.sin(t*13.7)*.55;}});
 const flameTextures=useMemo(()=>Array.from({length:5},(_,i)=>{
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=224;
  const ctx=canvas.getContext('2d'),s=i-2;
  // Give each tongue a distinct crest and width so the burning window reads as
  // an irregular fire line, rather than a row of cloned warning icons.
  ctx.shadowColor='rgba(255,101,30,.68)';ctx.shadowBlur=13;
  ctx.beginPath();ctx.moveTo(14+s*2,220);
  ctx.bezierCurveTo(7+s*3,179,24-s*2,164,19+s*4,130);
  ctx.bezierCurveTo(14+s*5,103,35-s*3,91,34+s*2,61);
  ctx.bezierCurveTo(42-s*4,78,43+s*5,93,55+s*2,108);
  ctx.bezierCurveTo(71-s*3,126,69+s*2,151,80-s*4,166);
  ctx.bezierCurveTo(96+s*4,184,101-s*5,197,111-s*2,220);ctx.closePath();
  const outer=ctx.createLinearGradient(0,220,0,54);outer.addColorStop(0,'rgba(255,239,153,.98)');outer.addColorStop(.2,'rgba(255,162,55,.96)');outer.addColorStop(.62,'rgba(231,75,25,.89)');outer.addColorStop(1,'rgba(153,36,20,.08)');ctx.fillStyle=outer;ctx.fill();
  ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(38+s,220);
  ctx.bezierCurveTo(29-s*2,184,49+s,169,43-s,146);
  ctx.bezierCurveTo(39+s*2,125,58-s*2,112,61+s,90);
  ctx.bezierCurveTo(72-s,117,72+s*2,133,84-s,153);
  ctx.bezierCurveTo(94+s,177,79-s,196,91+s,220);ctx.closePath();
  const inner=ctx.createLinearGradient(0,220,0,91);inner.addColorStop(0,'rgba(255,255,218,.98)');inner.addColorStop(.42,'rgba(255,194,78,.94)');inner.addColorStop(1,'rgba(246,105,24,.04)');ctx.fillStyle=inner;ctx.fill();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
 }),[]);
 useEffect(()=>()=>flameTextures.forEach(texture=>texture.dispose()),[flameTextures]);
 const flames=[[-1.55,1.9,.56,1.25],[-.67,2.05,.68,1.75],[.25,1.95,.62,1.42],[1.18,2.04,.66,1.68],[1.72,1.82,.42,1.08]];
 return <group>
  <mesh position={[0,2.48,-7.38]}><planeGeometry args={[4.25,2.65]}/><meshBasicMaterial color="#210d0a"/></mesh>
  {flames.map(([x,y,radius,height],i)=><mesh key={x} position={[x,y,-7.18+i*.002]} scale={[radius*1.9,height*.84,1]}><planeGeometry args={[1,1]}/><meshBasicMaterial map={flameTextures[i]} transparent opacity={.94} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending}/></mesh>)}
  {[[-2.23,2.55,.12,2.65],[2.23,2.55,.12,2.65],[0,1.24,4.56,.12],[0,3.86,4.56,.12]].map(([x,y,w,h])=><mesh key={`${x}:${y}`} position={[x,y,-7.02]}><boxGeometry args={[w,h,.2]}/><meshStandardMaterial color="#34302c" roughness={.9}/></mesh>)}
  <pointLight ref={glow} position={[0,2,-6.15]} color="#ff6128" intensity={5.5} distance={15} decay={1}/>
 </group>;
}

function PhoneScreen({active}) {
 return <group rotation={[-.02,0,0]}>
  <mesh><boxGeometry args={[.118,.018,.235]}/><meshStandardMaterial color="#14181c" metalness={.45} roughness={.4}/></mesh>
  <mesh position={[0,.0102,0]}><boxGeometry args={[.098,.003,.208]}/><meshStandardMaterial color={active?'#9cdbed':'#202a2d'} emissive={active?'#49b9dc':'#000000'} emissiveIntensity={active?1.8:0} roughness={.35}/></mesh>
 </group>;
}

function HospitalEndingRoom({phase,paused}) {
 const phoneActive=phase==='ending_phone'||phase==='ending_voice';
 return <group>
  <Shell width={13} depth={14} height={4.2} tint="#687477" painted backOpening={{centerX:0,bottomY:1.25,width:4.45,height:2.55}}/>
  <Floor width={13} depth={14} repeat={[6,7]} color="#727b79" tiled/>
  <FireWindow paused={paused}/>
  <DetailProp asset="side_table_01" position={[2.45,0,.85]} height={.55066}/>
  <group position={[2.45,.551,.85]}><PhoneScreen active={phoneActive}/></group>
  <DoorOpening position={[-5.8,0,-4.1]} label="STAIR B / ROOF ACCESS"/>
  <DoorOpening position={[5.8,0,-4.1]} label="WARD 03 / RESTRICTED ACCESS"/>
  <mesh position={[-5.4,2.2,-4.02]}><boxGeometry args={[.12,.14,.08]}/><meshStandardMaterial color="#bf3d2f" emissive="#d32218" emissiveIntensity={1.4}/></mesh>
  <pointLight position={[-5.3,2.2,-3.5]} color="#d34236" intensity={1.6} distance={5}/>
  <DetailProp asset="medical_cart" position={[-3.4,0,-1.5]} rotation={[0,.25,0]}/>
  <DetailProp asset="hospital_bed" position={[4.55,0,-4.85]} rotation={[0,-.15,0]}/>
  <Fluorescent position={[-3,4.08,-1.5]} delay={2.6}/><Fluorescent position={[3,4.08,2]} delay={4.1}/>
  <pointLight position={[0,3.2,3.1]} color="#6688a4" intensity={phoneActive ? .75 : 1.1} distance={9}/>
  <pointLight position={[2.45,.8,.85]} color={phoneActive?'#5ccbed':'#23323a'} intensity={phoneActive?1.7:.12} distance={3}/>
 </group>;
}

function HospitalDispatch({room,hot,loading=false}) {
 return <group>
  <Shell width={12} depth={14} height={4.2} tint="#8e9997" painted/>
  <Floor width={12} depth={14} repeat={[4,4]} color="#8e9895" tiled/>
  <mesh position={[-2,1.65,-6.93]}><planeGeometry args={[4.3,3.3]}/><meshStandardMaterial color="#465654" metalness={.35} roughness={.65}/></mesh>
  {Array.from({length:14},(_,i)=><mesh key={i} position={[-2,.15+i*.23,-6.89]}><boxGeometry args={[4.3,.018,.018]}/><meshStandardMaterial color="#73817c" metalness={.4}/></mesh>)}
  <WallSign position={[-2,3.6,-6.9]} width={3.5} height={.5} title="SHASHDHAR / LOADING BAY"/>
  <DoorOpening position={[4.2,0,-6.75]} label="SERVICE LIFT / STAFF"/>
  <DetailProp asset="cargo_van" position={[-3,0,-2.2]} height={2.2} rotation={[0,Math.PI/2,0]}/>
  {loading ? <>
   {/* Cargo is staged between the shutter and the van's rear; the loaded dolly
       and clear path make the dispatch line legible from the story camera. */}
   <DetailProp asset="hand_truck" position={[-.65,0,-4.45]} rotation={[0,Math.PI,0]}/>
   <DetailProp asset="cardboard_box_01" position={[-.65,.48,-4.45]} scale={.82}/>
   <DetailProp asset="cardboard_box_01" position={[-.65,.98,-4.45]} scale={.82}/>
   <DetailProp asset="cardboard_box_01" position={[-1.65,0,-4.45]}/>
   <DetailProp asset="cardboard_box_01" position={[-1.65,.5,-4.45]}/>
   <DetailProp asset="cardboard_box_01" position={[-.35,0,-3.45]}/>
   <DetailProp asset="cardboard_box_01" position={[-.35,0,-2.45]}/>
   <WallSign position={[-2,2.02,-6.89]} width={2.55} height={.32} title="SEALED MEDICAL SUPPLIES" background="#334b47"/>
  </> : <>
   <DetailProp asset="hand_truck" position={[-.3,0,-1]}/>
   {[-4.9,-3.8,-2.7].map(x=><DetailProp key={x} asset="cardboard_box_01" position={[x,0,1.4]}/>)}
  </>}
  <DetailProp asset="metal_office_desk" position={[3.8,0,-2.8]}/>
  <DetailProp asset="clipboard" position={[3.8,.7875,-2.8]} scale={.7}/>
  <DetailProp asset="office_chair" position={[3.8,0,-1.65]} height={1.168*DESK_SEAT/.618} rotation={[0,Math.PI,0]}/>
  <DetailProp asset="office_phone" position={[4.4,.7875,-2.8]} scale={.8}/>
  <DetailProp asset="filing_cabinet" position={[5.2,0,-5.6]}/>
  <WallSign position={[3,2.6,-6.91]} width={2.6} height={.7} title="LUA PHARMACEUTICALS" lines={['SEALED SHIPMENTS / LOG EVERY TRANSFER']}/>
  <Fluorescent position={[-2,4.1,-2]}/><Fluorescent position={[2,4.1,2]}/>
  <pointLight position={[0,2.5,-1]} color="#d5e4dc" intensity={10} distance={14}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function TanushOfficeRoom({room,hot}) {
 return <group>
  <Shell width={13} depth={10} height={3.8} tint="#8c7663" painted/>
  <Floor width={13} depth={10} repeat={[6,5]} color="#b79a77"/>
  <Prop model="rugRectangle.glb" position={[.2,.002,.5]} scale={3.1} tint="#4c555a"/>
  <Prop model="desk.glb" position={[.4,0,-1.5]}/>
  <Prop model="chairDesk.glb" position={[.4,0,-2.65]}/>
  <Prop model="lampRoundTable.glb" position={[1.03,DESK_TOP,-1.62]}/>
  <DetailProp asset="clipboard" position={[-.05,DESK_TOP,-1.35]} scale={.65}/>
  <DetailProp asset="classic_laptop" position={[.55,DESK_TOP,-1.6]} scale={.8}/>
  <DetailProp asset="pencil_cup" position={[1.06,DESK_TOP,-1.1]}/>
  <ShelfContents position={[-5.7,0,-2.2]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="filing_cabinet" position={[-4.9,0,-4.3]}/>
  <DetailProp asset="filing_cabinet" position={[-3.8,0,-4.3]}/>
  <DetailProp asset="binder_notebook" position={[-4.9,.7225,-4.3]} scale={.75}/>
  <DetailProp asset="sofa_03" position={[4.5,0,.1]} rotation={[0,-Math.PI/2,0]}/>
  <DetailProp asset="modern_coffee_table_01" position={[3,0,.1]} rotation={[0,Math.PI/2,0]}/>
  <DetailProp asset="cup" position={[3,.39,.1]}/>
  <DetailProp asset="floor_lamp" position={[5.5,0,-1.5]} height={1.75}/>
  <DetailProp asset="potted_plant_02" position={[5.5,0,3.2]} height={1.3}/>
  <Window position={[6.44,1.9,-2.3]} rotation={[0,-Math.PI/2,0]} width={2.4} height={1.9}/>
  <DetailProp asset="curtains" position={[6.3,.4,-2.3]} rotation={[0,-Math.PI/2,0]} height={2.6}/>
  <WallSign position={[0,2.6,-4.94]} width={3.1} height={.7} title="PERIGEE / DIRECTOR" lines={['TANUSH']} background="#4a3830"/>
  <WallSign position={[-1.9,1.7,-4.94]} width={1.1} height={1.15} title="THIS WEEK" lines={['THURSDAY / HOSPITAL','SATURDAY / WORKSHOP']}/>
  <DoorOpening position={[4.2,0,-4.4]} label="PRIVATE OFFICE"/>
  <pointLight position={[1.03,1.2,-1.62]} color="#ffcb82" intensity={5} distance={5}/>
  <pointLight position={[0,3.1,1.5]} color="#efd7af" intensity={18} distance={12}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function EnakshiHouseRoom({room,hot}) {
 return <group>
  <Shell width={11} depth={9} height={3.4} tint="#927c72" painted/>
  <Floor width={11} depth={9} repeat={[5,4]} color="#b79878"/>
  <DetailProp asset="sofa_03" position={[-2.8,0,-.6]} rotation={[0,.15,0]}/>
  <Prop model="rugSquare.glb" position={[.2,.002,.5]} scale={2.9} tint="#626963"/>
  <DetailProp asset="modern_arm_chair_01" position={[2.2,0,1]} rotation={[0,-.8,0]}/>
  <DetailProp asset="side_table_01" position={[.2,0,-.4]}/>
  <DetailProp asset="tablet" position={[.2,.55066,-.4]} scale={.65}/>
  <Candle position={[-.03,.55066,-.4]} height={.24}/>
  <Candle position={[.42,.55066,-.3]} height={.16}/>
  <ShelfContents position={[4.8,0,-1.2]} rotation={[0,-Math.PI/2,0]}/>
  <DetailProp asset="filing_cabinet" position={[3.5,0,-3.8]}/>
  <DetailProp asset="clipboard" position={[3.5,.7225,-3.8]} scale={.65}/>
  <Window position={[-5.44,1.85,-1.4]} rotation={[0,Math.PI/2,0]} width={2} height={1.7}/>
  <DetailProp asset="curtains" position={[-5.3,.4,-1.4]} rotation={[0,Math.PI/2,0]} height={2.5}/>
  <DetailProp asset="floor_lamp" position={[-4.3,0,2.8]} height={1.75}/>
  <DetailProp asset="potted_plant_02" position={[4.5,0,3.1]} height={1.2}/>
  <WallSign position={[-1.7,2,-4.42]} width={1.4} height={.55} title="PERIGEE FOUNDATION" lines={['A HIGHER PURPOSE']} background="#513d3a"/>
  <DoorOpening position={[.8,0,-4.2]} label="PRIVATE"/>
  <pointLight position={[-4.3,1.4,2.8]} color="#ffca82" intensity={7} distance={7}/>
  <pointLight position={[0,2.7,0]} color="#dfc3a6" intensity={12} distance={9}/>
  <HotspotMarkers room={room} hot={hot}/>
 </group>;
}

function DoorOpening({position,label}) {
 return <group position={position}>
  <mesh position={[-.68,1.12,0]}><boxGeometry args={[.12,2.24,.28]}/><meshStandardMaterial color="#4b514e"/></mesh>
  <mesh position={[.68,1.12,0]}><boxGeometry args={[.12,2.24,.28]}/><meshStandardMaterial color="#4b514e"/></mesh>
  <mesh position={[0,2.28,0]}><boxGeometry args={[1.48,.12,.28]}/><meshStandardMaterial color="#4b514e"/></mesh>
  <mesh position={[0,1.1,-.15]}><planeGeometry args={[1.24,2.2]}/><meshStandardMaterial color="#39403d" roughness={.8}/></mesh>
  <WallSign position={[0,2.58,.04]} width={1.45} height={.36} title={label}/>
 </group>;
}


const ROOM_KITS = {
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
export function RoomEnvironment({ roomId, room = null, hot = null, paused=false,storyAct,cinematicPhase }) {
  const Kit = roomId==='concert'&&['capture','departure'].includes(cinematicPhase)?ConcertCaptureRoom:(ROOM_KITS[roomId] ?? SameerRoomScene);
  const empty = { id: roomId, hotspots: [] };
  return <Kit room={room ?? empty} hot={hot ?? { state: { discovered: [] }, solvedPuzzles: [] }} paused={paused} actId={storyAct??hot?.state?.act} phase={cinematicPhase}/>;
}
export function RoomLighting({ roomId, quality = 'high',cinematicPhase }) {
  const outdoor = OUTDOOR_ROOMS.has(roomId);
  const gazebo=roomId==='gazebo';
  const night=outdoor&&roomId!=='gazebo';
  const field=roomId==='abandoned_field';
  const cinematicNight=roomId==='concert'&&['capture','departure'].includes(cinematicPhase);
  const finalHospital=roomId==='hospital'&&String(cinematicPhase??'').startsWith('ending_');
  return <>
    <Environment files={gazebo?"/assets/cinema/park_sunrise_1k.hdr":outdoor ? "/assets/cinema/park_bench_1k.hdr" : "/assets/env/ballroom_2k.hdr"} ground={gazebo?{height:2,radius:70,scale:120}:undefined} background={outdoor&&roomId!=='abandoned_field'&&!cinematicNight} backgroundBlurriness={.02} backgroundIntensity={finalHospital ? .06 : gazebo ? .35 : night ? .045 : .8} environmentIntensity={finalHospital ? .19 : gazebo ? .56 : field ? .68 : night ? .3 : outdoor ? .85 : .62} />
    <ambientLight intensity={finalHospital ? .24 : gazebo ? .5 : field ? 1.05 : night ? .5 : outdoor ? .65 : .8} color={finalHospital?'#8193a2':gazebo?'#e8caa7':field?'#cbd8e8':'#bdcce8'} />
    <directionalLight position={[-4, 8, 6]} intensity={finalHospital ? .38 : gazebo ? 1.1 : field ? 1.7 : night ? .85 : outdoor ? 2 : 1.7} color={finalHospital?'#9aacbf':gazebo?'#ffd2a4':field?'#d7e3f4':night?'#a5bcdc':outdoor?'#ffe2a9':'#d7e5ee'} castShadow={quality !== 'low'}
      shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
      shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
      shadow-camera-far={38} shadow-bias={-0.0005} />
    <directionalLight position={[4, 4, -3]} intensity={finalHospital ? .12 : field ? .72 : gazebo ? .38 : night ? .22 : .6} color={finalHospital?'#667a8d':field?'#9db8e4':night?'#7b9fce':'#e0ab7b'} />
  </>;
}

// ---------- canvas ----------

function CameraRig({ focusInfo,view }) {
  const { camera, controls } = useThree();
  const desiredPosition = useRef(new THREE.Vector3(0, 2.3, 7.8));
  const desiredLook = useRef(new THREE.Vector3(0, 1.5, -0.3));
  const transitioning = useRef(false);

  useEffect(() => {
    if (focusInfo) {
      desiredPosition.current.set(...focusInfo.camera);
      desiredLook.current.set(...focusInfo.look);
    } else {
      desiredPosition.current.set(...view.at);
      desiredLook.current.set(...view.look);
    }
    transitioning.current = true;
    if (controls) controls.enabled = !focusInfo;
  }, [focusInfo, controls,view]);

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
  onReady,
  onMetrics,
}) {
  const room = state.rooms.find((r) => r.id === roomId) ?? state.rooms[0];
  const isOutdoor = OUTDOOR_ROOMS.has(room.id);
  const view=ROOM_VIEWS[room.id]??{at:[0,2.65,8.8],look:[0,1.1,-.4],fov:52};
  const [heights, setHeights] = useState({});

  // Skinned meshes can report bogus bounds, so clamp to a believable range:
  // outside 1.4-2.4 m we assume the standard 1.9 m human.
  const measure = useCallback((id, height) => {
    const safe = height > 1.4 && height < 2.4 ? height : 1.9;
    setHeights((prev) => (prev[id] === safe ? prev : { ...prev, [id]: safe }));
  }, []);

  const focusPosition = useMemo(() => {
    if (!focus) return null;
    if(room.id==='police_station'&&focus.character==='officer')return [POLICE.officer[0],DESK_SEAT-.4915,POLICE.officer[1]];
    const [x, , z] = hotspotPosition(focus, 0); return [x, 0, z];
  }, [focus,room.id]);

  const focusInfo = useMemo(() => {
    if (!focus || !focusPosition) return null;
    const height = room.id==='police_station'&&focus.character==='officer'?1.5:heights[focus.character] || 1.9;
    return {
      look: [focusPosition[0], focusPosition[1] + height * 0.82, focusPosition[2]],
      camera: [
        focusPosition[0] + height * 0.03,
        focusPosition[1] + height * 0.84,
        focusPosition[2] + height * 1.05,
      ],
    };
  }, [focus, focusPosition, heights,room.id]);

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

  const [sceneStopped, setSceneStopped] = useState(null);
  useEffect(() => { setSceneStopped(null); }, [room.id]);

  const bounds = ROOM_BOUNDS[room.id] ?? { x: 6.5, zMin: -5.5, zMax: 9 };
  const bg = room.id==='abandoned_field' ? '#26394e' : isOutdoor ? '#05070d' : '#080604';

  const { quality } = useSettings();
  return (
    <WorldBoundary resetKey={room.id}>
      {sceneStopped ? <WorldStopped reason={sceneStopped} /> : (
      <Canvas shadows={quality !== 'low' ? 'percentage' : false}
        dpr={quality === 'high' ? [1, 1.65] : quality === 'medium' ? [1, 1] : [0.6, 0.8]}
        gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
        camera={{ position: view.at, fov: view.fov }}>
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={room.id==='abandoned_field'?[bg,12,50]:isOutdoor ? [bg, 25, 65] : [bg, 22, 42]} />
        <Suspense fallback={<SceneLoading />}>
          <RoomLighting roomId={room.id} quality={quality} />
          <RoomEnvironment roomId={room.id} room={room} hot={hot} />
          <OrbitControls makeDefault enablePan enableDamping dampingFactor={0.08}
            target={view.look} minDistance={2.6} maxDistance={16}
            minPolarAngle={0.35} maxPolarAngle={Math.PI / 2.02} />
          <CameraRig key={room.id} focusInfo={focusInfo} view={view} />
          <ExploreKeys disabled={!!focus} bounds={bounds} />
          <ListenerPosition />
          <SceneReady onReady={onReady} onMetrics={onMetrics}/>
        </Suspense>
        <SceneWatchdog onStopped={setSceneStopped} />
        <PerformanceGuard />
        {quality === 'high' && <EffectComposer multisampling={2}>
          <Bloom intensity={0.18} luminanceThreshold={0.85} mipmapBlur />
          <Vignette offset={0.3} darkness={room.id==='abandoned_field'?.16:.35} />
        </EffectComposer>}
      </Canvas>
      )}
    </WorldBoundary>
  );
}

// Publishes the camera's ground position so diegetic audio (the cafe radio)
// can fade with the player's distance from its speaker.
function ListenerPosition() {
  const { camera } = useThree();
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, 0.05);
    if (elapsed.current < 0.25) return;
    elapsed.current = 0;
    window.dispatchEvent(new CustomEvent('arena-listener', { detail: { x: camera.position.x, z: camera.position.z } }));
  });
  return null;
}

function ExploreKeys({ disabled, bounds }) {
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
    if (next.x < -bounds.x || next.x > bounds.x || next.z < bounds.zMin || next.z > bounds.zMax) return;
    camera.position.add(step); controls.target.add(step); controls.update();
  });
  return null;
}
