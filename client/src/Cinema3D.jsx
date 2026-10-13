import { lazy, Suspense, useEffect, useMemo, useRef, useState, Component } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Vector3 } from 'three';
import Actor from './Actor.jsx';
const SceneEnvironment=lazy(()=>import('./Scene.jsx').then(({RoomEnvironment,RoomLighting})=>({default:({roomId,quality,cinematicPhase,paused,actId})=><><RoomLighting roomId={roomId} quality={quality} cinematicPhase={cinematicPhase}/><RoomEnvironment roomId={roomId} paused={paused} storyAct={actId} cinematicPhase={cinematicPhase}/></>})));
import { useSettings } from './Settings.jsx';
import { SceneLoading, SceneWatchdog, WorldBoundary, SceneReady } from './WorldBoundary.jsx';
import PerformanceGuard from './PerformanceGuard.jsx';
import { placeCast, roomWideShot, captureShot } from './SceneStaging.js';
import { createRenderer } from './renderer.js';
const CLOSE={close_parth:'parth',close_mother:'mother',close_officer:'officer'};
// Errors thrown inside the canvas root do not reach boundaries outside the
// Canvas, so the scene tree carries its own boundary. It retries itself in
// place: a transient scene error must never cost the player the 3D stage.
class SceneErrorBoundary extends Component {
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true};}
  componentDidCatch(error){console.error('scene_error',error.message);this.props.onFail?.();}
  componentDidMount(){this.timer=setInterval(()=>{if(this.state.failed)this.setState({failed:false});},2500);}
  componentWillUnmount(){clearInterval(this.timer);}
  componentDidUpdate(prevProps){if(this.state.failed&&prevProps.resetKey!==this.props.resetKey)this.setState({failed:false});}
  render(){return this.state.failed?null:this.props.children;}
}
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
export default function Cinema({sceneId='gazebo',shot='wide',cast=[],speaker,ending=false,paused=false,onReady,onFail,actId,cinematicPhase}) {
  const {quality}=useSettings();
  const people=useMemo(()=>placeCast(sceneId,cast),[cast,sceneId]);
  const cinematicNight=['concert','ngo_hq'].includes(sceneId)&&['capture','departure'].includes(cinematicPhase);
  const backdrop=cinematicNight?'#26394e':'#10171c';
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[stalled,setStalled]=useState(false);
  useEffect(()=>{setReady(false);setFailed(false);setStalled(false);},[sceneId,cinematicPhase]);
  const handleReady=()=>{setReady(true);onReady?.();};
  const handleFail=()=>{setFailed(true);onFail?.();};
  // The renderer factory inside `createRenderer` keeps retrying until the
  // browser hands over a WebGL2 context — hardware or the software fallback a
  // device with 3D switched off still provides. The cinema only ever shows the
  // 3D stage: until frames arrive the loading card explains what is happening,
  // and a lost context is restored in place instead of downgrading the view.
  return <WorldBoundary resetKey={`${sceneId}:${cinematicPhase??'default'}`}>
    <div className="cinema-world">
    <Canvas shadows={quality!=='low'?'percentage':false}
      dpr={quality==='high'?[1,1.5]:quality==='medium'?[1,1]:[0.6,0.8]}
      gl={createRenderer}
      camera={{position:[0,2.15,6.2],fov:39}}>
      <color attach="background" args={[sceneId==='abandoned_field'||cinematicNight?'#26394e':'#10171c']}/><fog attach="fog" args={[sceneId==='gazebo'?'#9bafa5':backdrop,28,85]}/>
      <SceneErrorBoundary resetKey={`${sceneId}:${cinematicPhase??'default'}`} onFail={handleFail}>
        <Suspense fallback={null}>
          <SceneEnvironment roomId={sceneId} quality={quality} cinematicPhase={cinematicPhase} paused={paused} actId={actId}/>
          <spotLight position={[0,4,5]} angle={.7} penumbra={1} color="#ffdfbe" intensity={24} distance={13}/>
          {people.map(c=><group key={c.character} position={[c.at[0],c.y,c.at[1]]} rotation={[c.rotationX??0,c.rot??0,0]}><Actor character={c.character} pose={c.pose} footLift={c.footLift} paused={paused} speaking={c.character===speaker} wearingMask={c.wearingMask} holdingMask={c.holdingMask}/></group>)}
          <SceneReady key={`${sceneId}:${cinematicPhase??'default'}`} onReady={handleReady}/>
        </Suspense>
      </SceneErrorBoundary>
      <SceneWatchdog onState={(state)=>setStalled(state==='stalled')}/>
      <PerformanceGuard/>
      <ShotCamera roomId={sceneId} shot={shot} cast={people} speaker={speaker} paused={paused} cinematicPhase={cinematicPhase}/>
      {quality==='high'&&<EffectComposer multisampling={0}><Bloom intensity={.12} luminanceThreshold={1} mipmapBlur/><Vignette offset={.22} darkness={.35}/></EffectComposer>}
    </Canvas>
    {!ready&&!failed&&<SceneLoading label={stalled?'Still starting 3D graphics':'Opening the scene'}/>}
    {ready&&stalled&&<SceneLoading label="Restoring 3D graphics"/>}
    </div>
  </WorldBoundary>;
}
