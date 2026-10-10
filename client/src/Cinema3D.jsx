import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Vector3 } from 'three';
import Actor from './Actor.jsx';
import { RoomEnvironment, RoomLighting } from './Scene.jsx';
import { useSettings } from './Settings.jsx';
import { SceneLoading, WorldBoundary,SceneReady } from './WorldBoundary.jsx';
import { placeCast, wideShot } from './SceneStaging.js';
export const BACKDROPS = {};
const CLOSE={close_parth:'parth',close_mother:'mother',close_officer:'officer'};
function ShotCamera({roomId,shot,cast,speaker,paused}) {
  const timer=useRef(0),last=useRef('');
  const focus=speaker&&!['narrator','voice'].includes(speaker)?speaker:CLOSE[shot];
  const person=cast.find(c=>c.character===focus);
  const seated=person?.pose==='sit';
  const center=person?[person.at[0],(seated?1.29:1.63)+(person.y??0),person.at[1]]:[0,1.1,0];
  // A desk-facing actor's direct eye line passes through the laptop. Offset the
  // portrait to the open side of the workstation while preserving face focus.
  const deskPortrait=seated&&['sameer_room','parth_room'].includes(roomId);
  const angle=(person?.rot??0)-(deskPortrait ? .55 : 0),portrait=!!person&&shot!=='wide',distance=portrait?1.82:6.2;
  const cameraAt=portrait?[center[0]+Math.sin(angle)*distance+.12,center[1]+.12,center[2]+Math.cos(angle)*distance]:roomId==='police_station'?[4.3,2.6,6.3]:[.35,2.4,7.2];
  if(!portrait&&roomId==='police_station')center.splice(0,3,0,1.15,-.8);
  const target=new Vector3(...center),desired=new Vector3(...cameraAt),animated=new Vector3();
  useFrame(({camera},dt)=>{
    if(!portrait){const wide=wideShot(cast,camera.aspect);target.set(...wide.center);desired.set(...wide.at);}
    const key=roomId+shot+focus;
    if(last.current!==key){last.current=key;timer.current=0;camera.position.copy(desired);}
    if(!paused)timer.current+=Math.min(dt,.05);
    animated.copy(desired);animated.x+=Math.sin(timer.current*.09)*.055;animated.z-=Math.min(timer.current*.005,.12);
    camera.position.lerp(animated,1-Math.exp(-3*dt));camera.lookAt(target);
  });return null;
}
export default function Cinema({sceneId='gazebo',shot='wide',cast=[],speaker,ending=false,paused=false,onReady}) {
  const {quality}=useSettings();
  const people=useMemo(()=>placeCast(sceneId,cast),[cast,sceneId]);
  return <WorldBoundary key={sceneId}><Canvas shadows={quality!=='low'} dpr={[1,quality==='high'?1.5:1]} camera={{position:[0,2.15,6.2],fov:39}}>
    <color attach="background" args={['#10171c']}/><fog attach="fog" args={[sceneId==='gazebo'?'#9bafa5':'#10171c',28,85]}/>
    <Suspense fallback={<SceneLoading/>}>
      <RoomLighting roomId={sceneId} quality={quality}/><RoomEnvironment roomId={sceneId} paused={paused}/>
      <spotLight position={[0,4,5]} angle={.7} penumbra={1} color="#ffdfbe" intensity={24} distance={13}/>
      {people.map(c=><group key={c.character} position={[c.at[0],c.y,c.at[1]]} rotation={[0,c.rot??0,0]}><Actor character={c.character} pose={c.pose} footLift={c.footLift} paused={paused} speaking={c.character===speaker}/></group>)}
      {ending&&<pointLight position={[0,1.2,0]} intensity={6} color="#ff5828" distance={15}/>}
      <SceneReady key={sceneId} onReady={onReady}/>
    </Suspense>
    <ShotCamera roomId={sceneId} shot={shot} cast={people} speaker={speaker} paused={paused}/>
    {quality!=='low'&&<EffectComposer multisampling={0}><Bloom intensity={.12} luminanceThreshold={1} mipmapBlur/><Vignette offset={.22} darkness={.35}/></EffectComposer>}
  </Canvas></WorldBoundary>;
}

