import {useEffect,useMemo} from 'react';
import {useGLTF,useTexture} from '@react-three/drei';
import {Box3,Vector3,RepeatWrapping,SRGBColorSpace,CanvasTexture,CatmullRomCurve3} from 'three';

// Original licensed meshes. Centre/ground each selected modular part independently.
export function DetailProp({asset,part,position=[0,0,0],rotation=[0,0,0],scale=1,height,tint,alphaMap}){
 const {scene}=useGLTF(`/assets/detail/${asset}.glb`);
 const model=useMemo(()=>{
  const original=part?scene.getObjectByName(part):scene;
  if(!original)throw Error(`Missing ${asset}/${part}`);
  const copy=original.clone(true);copy.updateMatrixWorld(true);
  const materials=[];
  copy.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
   o.material=[].concat(o.material).map(m=>{const mat=m.clone();materials.push(mat);
    if(tint)mat.color.set(tint);
    if(asset==='sedan'&&mat.name==='blue'){mat.color.set('#b7b9ad');mat.metalness=.55;mat.roughness=.62;}
    if(asset==='sedan_detailed'&&mat.name==='paint'){mat.map=null;mat.color.set('#b9bcb2');mat.metalness=.55;mat.roughness=.6;}
    if(asset==='sedan_detailed'&&mat.name.startsWith('glass')){mat.transparent=true;mat.opacity=.3;mat.depthWrite=false;mat.roughness=.12;}
    if(asset==='modular_chainlink_fence'&&mat.name.includes('wire')){mat.alphaTest=.45;mat.transparent=false;mat.depthWrite=true;
     if(alphaMap){mat.alphaMap=alphaMap.clone();if(mat.map){mat.alphaMap.repeat.copy(mat.map.repeat);mat.alphaMap.offset.copy(mat.map.offset);mat.alphaMap.rotation=mat.map.rotation;mat.alphaMap.wrapS=mat.map.wrapS;mat.alphaMap.wrapT=mat.map.wrapT;mat.alphaMap.flipY=mat.map.flipY;}mat.alphaMap.needsUpdate=true;}
    }
    if(/grass|weed|plant/.test(asset)){mat.alphaTest=.4;mat.transparent=false;mat.depthWrite=true;}
    return mat;});if(o.material.length===1)o.material=o.material[0];
  }});
  const bounds=new Box3().setFromObject(copy),size=bounds.getSize(new Vector3());
  return {copy,materials,size,offset:[-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2]};
 },[scene,part,asset,tint,alphaMap]);
 useEffect(()=>()=>model.materials.forEach(m=>{if(alphaMap&&m.alphaMap)m.alphaMap.dispose();m.dispose();}),[model]);
 return <group position={position} rotation={rotation} scale={height?height/model.size.y:scale}><group position={model.offset}><primitive object={model.copy}/></group></group>;
}

export function FencePanel(props){const alpha=useTexture('/assets/detail/fence-alpha.png');return <DetailProp asset="modular_chainlink_fence" part="modular_chainlink_fence_double" height={1.7} alphaMap={alpha} {...props}/>;}

export function TerrainSurface({material='aerial_grass_rock',width=48,depth=48,position=[0,0,0],repeat=[12,12],color='#c0bfaf',trail=false}){
 const source=useTexture(['diff','normal','rough'].map(n=>`/assets/detail/${material}-${n}.jpg`));
 const textures=useMemo(()=>source.map((s,i)=>{const t=s.clone();t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(...repeat);t.anisotropy=8;if(i===0)t.colorSpace=SRGBColorSpace;return t;}),[source,repeat[0],repeat[1]]);
 useEffect(()=>()=>textures.forEach(t=>t.dispose()),[textures]);
 const mask=useMemo(()=>{if(!trail)return null;const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');const grad=g.createLinearGradient(0,0,256,0);grad.addColorStop(0,'black');grad.addColorStop(.2,'white');grad.addColorStop(.8,'white');grad.addColorStop(1,'black');g.fillStyle=grad;g.fillRect(0,0,256,256);const t=new CanvasTexture(c);return t;},[trail]);
 useEffect(()=>()=>mask?.dispose(),[mask]);
 return <mesh position={position} rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[width,depth]}/><meshStandardMaterial map={textures[0]} normalMap={textures[1]} roughnessMap={textures[2]} normalScale={[.45,.45]} color={color} alphaMap={mask} transparent={trail} depthWrite={!trail}/></mesh>;
}

export function WallSign({position,rotation=[0,0,0],width=1.4,height=.5,title,lines=[],background='#182d30',ink='#e2c78e'}){
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
 return <mesh position={position} rotation={rotation}><planeGeometry args={[width,height]}/><meshStandardMaterial map={texture} roughness={.9}/></mesh>;
}

export function Cable({points,color='#20272b',radius=.009}){
 const curve=useMemo(()=>new CatmullRomCurve3(points.map(p=>new Vector3(...p))),[JSON.stringify(points)]);
 return <mesh><tubeGeometry args={[curve,24,radius,5,false]}/><meshStandardMaterial color={color} roughness={.85}/></mesh>;
}

export function ComputerStation({position=[0,0,0],number=1,deskY=.7875,rotation=[0,0,0]}){
 return <group position={position} rotation={rotation}>
  <DetailProp asset="metal_office_desk"/>
  <DetailProp asset="monitor" position={[-.18,deskY,-.2]}/>
  <DetailProp asset="keyboard" position={[-.2,deskY,.25]}/>
  <DetailProp asset="mouse" position={[.42,deskY,.22]}/>
  <DetailProp asset="office_chair" position={[0,0,1.05]} rotation={[0,Math.PI,0]} height={1.168*.49035/.618}/>
  <WallSign position={[-.18,deskY+.33,-.12]} width={.39} height={.23} title={`RAMU / ${String(number).padStart(2,'0')}`} lines={['INTERNET • PRINT • SCAN']} background={number%2?'#17343c':'#293c34'} ink="#9ebfb6"/>
  <Cable points={[[-.18,deskY+.12,-.35],[-.18,deskY-.07,-.48],[.6,.18,-.45],[.7,.05,-.45]]}/>
 </group>;
}

export function ShelfContents({position=[0,0,0],rotation=[0,0,0]}){
 return <group position={position} rotation={rotation}><DetailProp asset="wooden_bookshelf_worn"/>
  {[.395,.675,1.285,1.675].map((y,i)=><DetailProp key={y} asset="book_encyclopedia_set_01" position={[-.25+(i%2)*.35,y,0]} scale={.8}/>)}
  <DetailProp asset="cardboard_box_01" position={[.34,.395,.04]} scale={.65}/>
 </group>;
}
