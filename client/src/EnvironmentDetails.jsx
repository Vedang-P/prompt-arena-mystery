import {Component,Suspense,useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useGLTF,useTexture} from '@react-three/drei';
import {Box3,Vector3,RepeatWrapping,SRGBColorSpace,CanvasTexture,CatmullRomCurve3} from 'three';
import {scatterInstanceMatrix} from './InstanceTransform.js';
import {useSettings} from './Settings.jsx';
import {AssetBoundary} from './WorldBoundary.jsx';

// One broken model must not blank the room: each prop is isolated so a missing
// or corrupt asset renders nothing while the rest of the scene carries on.
export function DetailProp(props){return <AssetBoundary fallback={null}><DetailPropMesh {...props}/></AssetBoundary>;}

// Original licensed meshes. Centre/ground each selected modular part independently.
function DetailPropMesh({asset,part,position=[0,0,0],rotation=[0,0,0],scale=1,height,tint,alphaMap,castShadow=true,receiveShadow=true}){
 const {scene}=useGLTF(`/assets/detail/${asset}.glb`);
 const model=useMemo(()=>{
  const original=part?scene.getObjectByName(part):scene;
  if(!original)throw Error(`Missing ${asset}/${part}`);
  const copy=original.clone(true);copy.updateMatrixWorld(true);
  const materials=[];
  copy.traverse(o=>{if(o.isMesh){o.castShadow=castShadow;o.receiveShadow=receiveShadow;
   o.material=[].concat(o.material).map(m=>{const mat=m.clone();materials.push(mat);
    if(tint)mat.color.set(tint);
    if(asset==='sedan'&&mat.name==='blue'){mat.color.set('#b7b9ad');mat.metalness=.55;mat.roughness=.62;}
    if(asset==='sedan_detailed'&&mat.name==='paint'){mat.color.set('#b9bcb2');mat.metalness=.24;mat.roughness=.52;}
    if(asset==='sedan_detailed'&&mat.name.startsWith('glass')){mat.transparent=true;mat.opacity=.18;mat.depthWrite=false;mat.roughness=.12;}
    if(asset==='modular_chainlink_fence'&&mat.name.includes('wire')){mat.alphaTest=.45;mat.transparent=false;mat.depthWrite=true;
     if(alphaMap){mat.alphaMap=alphaMap.clone();if(mat.map){mat.alphaMap.repeat.copy(mat.map.repeat);mat.alphaMap.offset.copy(mat.map.offset);mat.alphaMap.rotation=mat.map.rotation;mat.alphaMap.wrapS=mat.map.wrapS;mat.alphaMap.wrapT=mat.map.wrapT;mat.alphaMap.flipY=mat.map.flipY;}mat.alphaMap.needsUpdate=true;}
    }
    if(/grass|weed|plant/.test(asset)){mat.alphaTest=.4;mat.transparent=false;mat.depthWrite=true;}
    return mat;});if(o.material.length===1)o.material=o.material[0];
  }});
  const bounds=new Box3().setFromObject(copy),size=bounds.getSize(new Vector3());
  return {copy,materials,size,offset:[-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2]};
 },[scene,part,asset,tint,alphaMap,castShadow,receiveShadow]);
 useEffect(()=>()=>model.materials.forEach(m=>{if(alphaMap&&m.alphaMap)m.alphaMap.dispose();m.dispose();}),[model]);
 return <group position={position} rotation={rotation} scale={height?height/model.size.y:scale}><group position={model.offset}><primitive object={model.copy}/></group></group>;
}

// Repeated field plants share geometry and material; one instanced draw per
// species keeps the overgrowth without paying for a draw call per tuft.
export function InstancedDetailScatter(props){return <AssetBoundary fallback={null}><InstancedScatterMesh {...props}/></AssetBoundary>;}

function InstancedScatterMesh({asset,part,placements,castShadow=false,receiveShadow=true}){
 const {scene}=useGLTF(`/assets/detail/${asset}.glb`);
 const ref=useRef();
 const source=useMemo(()=>{
  const original=part?scene.getObjectByName(part):scene;
  if(!original)throw Error(`Missing ${asset}/${part}`);
  const copy=original.clone(true);copy.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(copy),size=bounds.getSize(new Vector3());
  const offset=new Vector3(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
  const meshes=[];
  copy.traverse(o=>{if(o.isMesh){
   const materials=[].concat(o.material).map(m=>{const mat=m.clone();if(/grass|weed|plant/.test(asset)){mat.alphaTest=.4;mat.transparent=false;mat.depthWrite=true;}return mat;});
   meshes.push({geometry:o.geometry,material:Array.isArray(o.material)?materials:materials[0],materials,matrix:o.matrixWorld.clone()});
  }});
  return {meshes,offset,size};
 },[scene,part,asset]);
 useLayoutEffect(()=>{
  if(!ref.current)return;
  placements.forEach((item,i)=>{
   ref.current.setMatrixAt(i,scatterInstanceMatrix(item,source.offset,source.meshes[0].matrix));
  });
  ref.current.count=placements.length;ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();
 },[placements,source]);
 useEffect(()=>()=>source.meshes.forEach(mesh=>mesh.materials.forEach(material=>material.dispose())),[source]);
 if(source.meshes.length!==1)throw Error(`${asset}/${part??'all'} must contain exactly one mesh for instanced scatter`);
 const mesh=source.meshes[0];
 return <instancedMesh ref={ref} args={[mesh.geometry,mesh.material,placements.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

export function FencePanel(props){const alpha=useTexture('/assets/detail/fence-alpha.png');return <DetailProp asset="modular_chainlink_fence" part="modular_chainlink_fence_double" height={1.7} alphaMap={alpha} {...props} castShadow={false}/>;}

export function TerrainSurface({material='aerial_grass_rock',width=48,depth=48,position=[0,0,0],repeat=[12,12],color='#c0bfaf',trail=false}){
 const source=useTexture(['diff','normal','rough'].map(n=>`/assets/detail/${material}-${n}.jpg`));
 const {quality}=useSettings();
 const anisotropy=quality==='high'?8:quality==='medium'?4:1;
 const textures=useMemo(()=>source.map((s,i)=>{const t=s.clone();t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(...repeat);t.anisotropy=anisotropy;if(i===0)t.colorSpace=SRGBColorSpace;return t;}),[source,repeat[0],repeat[1],anisotropy]);
 useEffect(()=>()=>textures.forEach(t=>t.dispose()),[textures]);
 const mask=useMemo(()=>{if(!trail)return null;const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');const grad=g.createLinearGradient(0,0,256,0);grad.addColorStop(0,'black');grad.addColorStop(.2,'white');grad.addColorStop(.8,'white');grad.addColorStop(1,'black');g.fillStyle=grad;g.fillRect(0,0,256,256);const t=new CanvasTexture(c);return t;},[trail]);
 useEffect(()=>()=>mask?.dispose(),[mask]);
 return <mesh position={position} rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[width,depth]}/><meshStandardMaterial map={textures[0]} normalMap={textures[1]} roughnessMap={textures[2]} normalScale={[.45,.45]} color={color} alphaMap={mask} transparent={trail} depthWrite={!trail}/></mesh>;
}

// Generated board art (public/assets/signs) keyed by the exact text the boards
// draw. Boards without art, and every run at low quality, keep the canvas
// version so the extra textures are only fetched when they can be shown.
const SIGN_FILES={
 "RAMU'S CYBER CAFÉ|INTERNET • PRINTING • SCANNING":'/assets/signs/sign_cyber_cafe.jpg',
 "DOSA CORNER|PLAIN DOSA   ₹40|MASALA DOSA   ₹60":'/assets/signs/sign_dosa_menu.jpg',
 "HOUSE RULES|SAVE YOUR WORK|ASK RAMU FOR HELP":'/assets/signs/sign_house_rules.jpg',
 "RAMU'S DOSA CORNER|FRESH BATTER • FILTER COFFEE":'/assets/signs/sign_dosa_batter.jpg',
 "CAFÉ SEATING|PLEASE TAKE A TABLE":'/assets/signs/sign_cafe_seating.jpg',
 "RAMU / 01|INTERNET • PRINT • SCAN":'/assets/signs/sign_ramu_plaque_01.jpg',
 "RAMU / 02|INTERNET • PRINT • SCAN":'/assets/signs/sign_ramu_plaque_02.jpg',
 "RAMU / 03|INTERNET • PRINT • SCAN":'/assets/signs/sign_ramu_plaque_03.jpg',
 "STAY CURIOUS|LOOK CLOSER|QUESTION EVERYTHING":'/assets/signs/sign_stay_curious.jpg',
 "APOGEE / 2019|FIRST SHOW • FRONT ROW":'/assets/signs/sign_apogee_2019.jpg',
 // Pending artwork regeneration: the THE MOON'S DARK SIDE board renders the wrong text.
 "OUR FAMILY|A home full of memories":'/assets/signs/sign_our_family.jpg',
 "PARTH|":'/assets/signs/sign_parth.jpg',
 "APOGEE|LIVE / A PERIGEE EVENT":'/assets/signs/banner_apogee_stage.jpg',
 "BACKSTAGE|PASS HOLDERS ONLY":'/assets/signs/sign_backstage.jpg',
 "PERIGEE|MEMBER REGISTRATION":'/assets/signs/sign_member_registration.jpg',
 "SHASHDHAR EMS|EMERGENCY RESPONSE":'/assets/signs/sign_shashdhar_ems.jpg',
 "APOGEE / SERVICE YARD|STAFF & VEHICLES ONLY":'/assets/signs/sign_service_yard.jpg',
 // Pending artwork regeneration: the PERIGEE / NIGHT SKY board is missing its sub-line.
 "PERIGEE FOUNDATION|REACH BEYOND THE ORDINARY":'/assets/signs/sign_perigee_foundation.jpg',
 "PROGRAMMES|NIGHT SKY WORKSHOPS|COMMUNITY OUTREACH":'/assets/signs/sign_programmes.jpg',
 "MEMBERSHIP|REGISTER AT RECEPTION|STAFF ACCESS BEYOND THIS POINT":'/assets/signs/sign_membership.jpg',
 "ARCHIVE / STAFF ONLY|":'/assets/signs/door_archive_staff.jpg',
 "RECORDS / 01|":'/assets/signs/sign_records_01.jpg',
 "RECORDS / 02|":'/assets/signs/sign_records_02.jpg',
 "RECORDS / 03|":'/assets/signs/sign_records_03.jpg',
 "RECORDS / 04|":'/assets/signs/sign_records_04.jpg',
 "RECORDS / 05|":'/assets/signs/sign_records_05.jpg',
 "ARCHIVE POLICY|NO RECORDS LEAVE THIS ROOM":'/assets/signs/sign_archive_policy.jpg',
 "SHASHDHAR HOSPITAL|WARD 03 / RESTRICTED ACCESS":'/assets/signs/sign_hospital_ward.jpg',
 "PERIGEE|THE ASCENSION":'/assets/signs/sign_perigee_ascension.jpg',
 "WARD 03|KEEP THE CORRIDOR CLEAR":'/assets/signs/sign_ward03_corridor.jpg',
 "SECURITY|AUTHORISED STAFF ONLY":'/assets/signs/sign_security.jpg',
 "SERVICE ACCESS|":'/assets/signs/door_service_access.jpg',
 "OPERATING THEATRE|":'/assets/signs/door_operating_theatre.jpg',
 "STAIR B / ROOF ACCESS|":'/assets/signs/door_stair_b.jpg',
 "WARD 03 / RESTRICTED ACCESS|":'/assets/signs/door_ward03_restricted.jpg',
 "SHASHDHAR / LOADING BAY|":'/assets/signs/sign_loading_bay.jpg',
 "SEALED MEDICAL SUPPLIES|":'/assets/signs/sign_sealed_medical.jpg',
 "LUA PHARMACEUTICALS|SEALED SHIPMENTS / LOG EVERY TRANSFER":'/assets/signs/sign_lua_pharma.jpg',
 "SERVICE LIFT / STAFF|":'/assets/signs/door_service_lift.jpg',
 "PERIGEE / DIRECTOR|TANUSH":'/assets/signs/sign_director_tanush.jpg',
 "THIS WEEK|THURSDAY / HOSPITAL|SATURDAY / WORKSHOP":'/assets/signs/sign_this_week.jpg',
 "PRIVATE OFFICE|":'/assets/signs/door_private_office.jpg',
 "PERIGEE FOUNDATION|A HIGHER PURPOSE":'/assets/signs/sign_perigee_higher.jpg',
 "PRIVATE|":'/assets/signs/door_private.jpg',
};

// A texture that fails to load must degrade to the drawn board, not the room.
class SignLoadBoundary extends Component{
 constructor(props){super(props);this.state={failed:false};}
 static getDerivedStateFromError(){return{failed:true};}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}

// Full-bleed board image cropped to the plane's aspect so the lettering never
// stretches, whatever shape the artwork arrived in.
function SignImage({src,width,height}){
 const {quality}=useSettings();
 const source=useTexture(src);
 const texture=useMemo(()=>{
  const t=source.clone();t.colorSpace=SRGBColorSpace;t.anisotropy=quality==='high'?8:4;
  const imageAspect=(source.image?.width??1)/(source.image?.height??1),planeAspect=width/height;
  if(imageAspect>planeAspect){const r=planeAspect/imageAspect;t.repeat.set(r,1);t.offset.set((1-r)/2,0);}
  else{const r=imageAspect/planeAspect;t.repeat.set(1,r);t.offset.set(0,(1-r)/2);}
  return t;
 },[source,width,height,quality]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <meshStandardMaterial map={texture} roughness={.9}/>;
}

function ProceduralSign({title,lines,background,ink,width,height}){
 const texture=useMemo(()=>{
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*height/width);
  const c=canvas.getContext('2d');c.fillStyle=background;c.fillRect(0,0,canvas.width,canvas.height);
  c.strokeStyle=ink;c.lineWidth=3;c.strokeRect(14,14,996,canvas.height-28);c.textAlign='center';c.fillStyle=ink;
  c.font=`600 ${Math.min(76,canvas.height*.22)}px Inter, sans-serif`;c.fillText(title,512,canvas.height*.35,950);
  c.font=`400 ${Math.min(38,canvas.height*.14)}px Inter, sans-serif`;
  lines.forEach((line,i)=>c.fillText(line,512,canvas.height*(.58+i*.16),950));
  const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t;
 },[title,lines.join('|'),background,ink,width,height]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <meshStandardMaterial map={texture} roughness={.9}/>;
}

export function WallSign({position,rotation=[0,0,0],width=1.4,height=.5,title,lines=[],background='#182d30',ink='#e2c78e'}){
 const {quality}=useSettings();
 const src=SIGN_FILES[`${title}|${lines.join('|')}`];
 const procedural=<ProceduralSign title={title} lines={lines} background={background} ink={ink} width={width} height={height}/>;
 return <mesh position={position} rotation={rotation}><planeGeometry args={[width,height]}/>
  {src&&quality!=='low'
   ? <Suspense fallback={procedural}><SignLoadBoundary fallback={procedural}><SignImage src={src} width={width} height={height}/></SignLoadBoundary></Suspense>
   : procedural}
 </mesh>;
}

export function Cable({points,color='#20272b',radius=.009}){
 const curve=useMemo(()=>new CatmullRomCurve3(points.map(p=>new Vector3(...p))),[JSON.stringify(points)]);
 return <mesh><tubeGeometry args={[curve,24,radius,5,false]}/><meshStandardMaterial color={color} roughness={.85}/></mesh>;
}

export function ComputerStation({position=[0,0,0],number=1,deskY=.7875,rotation=[0,0,0],deskTint}){
  return <group position={position} rotation={rotation}>
   <DetailProp asset="metal_office_desk" tint={deskTint}/>
   <DetailProp asset="monitor" position={[-.18,deskY,-.2]}/>
   <DetailProp asset="keyboard" position={[-.2,deskY,.25]}/>
   <DetailProp asset="mouse" position={[.42,deskY,.22]}/>
   {/* Chair tucked into the knee-hole, back to the room, facing the desk. */}
   <DetailProp asset="office_chair" position={[0,0,.62]} rotation={[0,Math.PI,0]} height={1.168*.49035/.618}/>
   <WallSign position={[0,.53,.485]} width={.39} height={.23} title={`RAMU / ${String(number).padStart(2,'0')}`} lines={['INTERNET • PRINT • SCAN']} background={number%2?'#17343c':'#293c34'} ink="#9ebfb6"/>
   <Cable points={[[-.18,deskY+.12,-.35],[-.18,deskY-.07,-.48],[.6,.18,-.45],[.7,.05,-.45]]}/>
  </group>;
}

export function ShelfContents({position=[0,0,0],rotation=[0,0,0]}){
 return <group position={position} rotation={rotation}><DetailProp asset="wooden_bookshelf_worn"/>
  {[.395,.675,1.285,1.675].map((y,i)=><DetailProp key={y} asset="book_encyclopedia_set_01" position={[-.25+(i%2)*.35,y,0]} scale={.8}/>)}
  <DetailProp asset="cardboard_box_01" position={[.34,.395,.04]} scale={.65}/>
 </group>;
}
