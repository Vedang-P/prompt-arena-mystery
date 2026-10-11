import { lazy, Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Vector3 } from 'three';
import Actor from './Actor.jsx';
const SceneEnvironment=lazy(()=>import('./Scene.jsx').then(({RoomEnvironment,RoomLighting})=>({default:({roomId,quality,cinematicPhase,paused,actId})=><><RoomLighting roomId={roomId} quality={quality} cinematicPhase={cinematicPhase}/><RoomEnvironment roomId={roomId} paused={paused} storyAct={actId} cinematicPhase={cinematicPhase}/></>})));
import { useSettings } from './Settings.jsx';
import { SceneLoading, WorldBoundary,SceneReady } from './WorldBoundary.jsx';
import { placeCast, roomWideShot, captureShot } from './SceneStaging.js';
export const BACKDROPS = {};
const CLOSE={close_parth:'parth',close_mother:'mother',close_officer:'officer'};
function ShotCamera({roomId,shot,cast,speaker,paused,cinematicPhase}) {
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
    if(!portrait){const wide=roomWideShot(roomId,cast,camera.aspect);target.set(...wide.center);desired.set(...wide.at);}
    if(cinematicPhase==='capture'||cinematicPhase==='departure'){
      const sceneShot=captureShot(camera.aspect);
      target.set(...sceneShot.center);desired.set(...sceneShot.at);
    }
    const key=roomId+shot+focus+cinematicPhase;
    if(last.current!==key){last.current=key;timer.current=0;camera.position.copy(desired);}
    if(!paused)timer.current+=Math.min(dt,.05);
    animated.copy(desired);animated.x+=Math.sin(timer.current*.09)*.055;animated.z-=Math.min(timer.current*.005,.12);
    camera.position.lerp(animated,1-Math.exp(-3*dt));camera.lookAt(target);
  });return null;
}
export default function Cinema({sceneId='gazebo',shot='wide',cast=[],speaker,ending=false,paused=false,onReady,actId,cinematicPhase}) {
  const {quality}=useSettings();
  const people=useMemo(()=>placeCast(sceneId,cast),[cast,sceneId]);
  const cinematicNight=sceneId==='concert'&&['capture','departure'].includes(cinematicPhase);
  const backdrop=cinematicNight?'#26394e':'#10171c';
  return <WorldBoundary key={`${sceneId}:${cinematicPhase??'default'}`}><Canvas shadows={quality!=='low'?'percentage':false} dpr={[1,quality==='high'?1.5:1]} camera={{position:[0,2.15,6.2],fov:39}}>
    <color attach="background" args={[sceneId==='abandoned_field'||cinematicNight?'#26394e':'#10171c']}/><fog attach="fog" args={[sceneId==='gazebo'?'#9bafa5':backdrop,28,85]}/>
    <Suspense fallback={<SceneLoading/>}>
      <SceneEnvironment roomId={sceneId} quality={quality} cinematicPhase={cinematicPhase} paused={paused} actId={actId}/>
      <spotLight position={[0,4,5]} angle={.7} penumbra={1} color="#ffdfbe" intensity={24} distance={13}/>
      {people.map(c=><group key={c.character} position={[c.at[0],c.y,c.at[1]]} rotation={[c.rotationX??0,c.rot??0,0]}><Actor character={c.character} pose={c.pose} footLift={c.footLift} paused={paused} speaking={c.character===speaker} wearingMask={c.wearingMask} holdingMask={c.holdingMask}/></group>)}
      <SceneReady key={`${sceneId}:${cinematicPhase??'default'}`} onReady={onReady}/>
    </Suspense>
    <ShotCamera roomId={sceneId} shot={shot} cast={people} speaker={speaker} paused={paused} cinematicPhase={cinematicPhase}/>
    {quality==='high'&&<EffectComposer multisampling={0}><Bloom intensity={.12} luminanceThreshold={1} mipmapBlur/><Vignette offset={.22} darkness={.35}/></EffectComposer>}
  </Canvas></WorldBoundary>;
}

