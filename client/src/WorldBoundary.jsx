import { Component,useEffect,useRef,useState } from 'react';
import {useProgress} from '@react-three/drei';
import {useFrame,useThree} from '@react-three/fiber';

export function SceneReady({onReady,onMetrics}){
  const callback=useRef(onReady),elapsed=useRef(0),done=useRef(false);callback.current=onReady;
  const sample=useRef([]);
  // Let WebGL draw and the initial animation blend settle before announcing it.
  useFrame(({gl},dt)=>{elapsed.current+=Math.min(dt,.05);if(!done.current&&elapsed.current>=.36){done.current=true;callback.current?.();}
    if(import.meta.env.DEV&&onMetrics&&done.current&&dt>0&&dt<1){sample.current.push({dt,calls:gl.info.render.calls,triangles:gl.info.render.triangles});if(sample.current.length===60){const frames=sample.current.splice(0),times=frames.map(f=>f.dt).sort((a,b)=>a-b);onMetrics({fps:Math.round(60/times.reduce((a,b)=>a+b,0)),p95:Math.round(times[56]*1000),geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,calls:Math.round(frames.reduce((a,f)=>a+f.calls,0)/frames.length),triangles:Math.round(frames.reduce((a,f)=>a+f.triangles,0)/frames.length)});}}
  });
  return null;
}

// Watches the render loop and reports whether the 3D view is live. A lost
// context is not fatal: three.js restores it, the renderer re-uploads, and the
// state flips back to `live` when frames arrive again. While frames are missing
// the caller shows a restoring overlay — the stage itself is never replaced.
// Slow machines can spend many seconds on their first shader compilation,
// texture upload and PMREM pass, so the clock only starts once a frame has
// actually drawn and a stall must survive two consecutive checks.
export function SceneWatchdog({ onState, timeoutMs = 10000 }) {
  const { gl } = useThree();
  const last = useRef(0);
  const started = useRef(false);
  const callback = useRef(onState);
  callback.current = onState;
  useFrame(() => { last.current = performance.now(); started.current = true; });
  useEffect(() => {
    const canvas = gl.domElement;
    const mountedAt = performance.now();
    let stalled = false;
    let misses = 0;
    const set = (value) => {
      if (stalled === value) return;
      stalled = value;
      callback.current?.(value ? 'stalled' : 'live');
    };
    // Three.js also listens for these events; preventDefault lets the browser
    // hand the context back after a transient GPU reset.
    const onLost = (event) => { event.preventDefault(); set(true); };
    const onRestored = () => { last.current = performance.now(); misses = 0; set(false); };
    const onVisible = () => { last.current = performance.now(); misses = 0; };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.hidden) { last.current = performance.now(); misses = 0; return; }
      const now = performance.now();
      if (!started.current) {
        // Never drew a frame yet: allow a long grace period before reporting.
        if (now - mountedAt > timeoutMs * 3) set(true);
        return;
      }
      if (now - last.current > timeoutMs) {
        misses += 1;
        if (misses >= 2) set(true);
      } else {
        misses = 0;
        set(false);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [gl, timeoutMs]);
  return null;
}

// The loading panel is a DOM overlay pinned to the centre of the stage — never
// an in-world element, which used to drift around the frame as the camera moved.
// The bar tracks every asset three.js is fetching, with the percentage shown.
// A loading card must never become a permanent wall: after a short grace period
// the player can dismiss it (button or Esc), a Reload action appears while it
// lingers, and it always steps aside on its own — the stage can still light up
// later, and the room stays playable through Explore and the room tabs.
export function SceneLoading({ label = 'Opening the scene', onDismiss, expireMs = 15000 }){
  const {progress,total}=useProgress();
  const [expired,setExpired]=useState(false);
  const [waited,setWaited]=useState(false);
  const dismiss=useRef(onDismiss);
  dismiss.current=onDismiss;
  const step=()=>{setExpired(true);dismiss.current?.();};
  useEffect(()=>{const timer=setTimeout(()=>setExpired(true),expireMs);return()=>clearTimeout(timer);},[expireMs]);
  // Long enough that a normal load never shows the controls, short enough that a
  // stuck scene can never hold the player hostage.
  useEffect(()=>{const timer=setTimeout(()=>setWaited(true),3500);return()=>clearTimeout(timer);},[]);
  useEffect(()=>{
    const key=(e)=>{if(e.key==='Escape')step();};
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  },[]);
  // The card must never leave a black stage unexplained: once it expires a small
  // chip stays behind so the player can always bring the scene back.
  if(expired)return <button className="scene-recovery-chip" onClick={()=>window.location.reload()}>Scene not responding — reload ↺</button>;
  const known=total>0;
  const pct=known?Math.max(0,Math.min(100,Math.round(progress))):null;
  return <div className="scene-loader" role="status" aria-live="polite" aria-label={label}>
    <div className="scene-loader-card">
      <span className="loading-moon" aria-hidden="true"/>
      <p>{label}</p>
      <div className={`scene-loader-track ${pct===null?'indeterminate':''}`}>
        <span style={pct===null?undefined:{width:`${pct}%`}}/>
      </div>
      <small>{pct===null?'Preparing…':`${pct}%`}</small>
      {waited&&<div className="scene-loader-actions">
        <button type="button" className="scene-loader-action" onClick={step}>Continue without waiting →</button>
        {pct!==null&&pct>=100&&<button type="button" className="scene-loader-action ghost" onClick={()=>window.location.reload()}>Reload scene ↺</button>}
      </div>}
    </div>
  </div>;
}

// One card for every terminal 3D failure — a dead context, a scene that keeps
// throwing, a boot that never arrives. It always says what happened and offers
// the three recoveries, so a black stage is never a dead end.
export function SceneRecoveryCard({ detail = null }) {
  return (
    <div className="world-fallback" role="alert">
      <p>The 3D view could not start on this device.</p>
      <p>Your case is saved. You can still play with the Explore list — or bring the stage back:</p>
      {detail && <p className="world-fallback-detail">{detail}</p>}
      <div className="world-fallback-actions">
        <button className="btn ghost" onClick={() => window.location.reload()}>Reload scene</button>
        <button className="btn ghost" onClick={recoverLowGraphics}>Reload on lowest graphics</button>
        <button className="btn ghost" onClick={clearCachesAndReload}>Clear cache &amp; reload</button>
      </div>
    </div>
  );
}

// One missing texture or model used to reject the whole room's Suspense tree and
// blank the entire scene. Each risky asset sits in its own boundary now: the
// broken piece renders nothing and everything else carries on.
export class AssetBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.warn('asset_error', error.message); }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
}

// A scene-tree error is retried in place instead of dead-ending the stage: the
// boundary resets itself a few times and the stage relights the moment a retry
// succeeds. A change of resetKey retries immediately, so the caller can swap
// rooms or cinematic scenes without remounting the canvas. After the retries
// are spent — or when WebGL itself could not start — a terminal card explains
// the situation and offers recovery, so nobody waits on a loader forever.
const MAX_SCENE_RETRIES = 3;
function recoverLowGraphics() {
  try {
    const saved = JSON.parse(localStorage.getItem('moon-settings') || '{}');
    localStorage.setItem('moon-settings', JSON.stringify({ ...saved, quality: 'low', autoTune: false }));
  } catch {}
  window.location.reload();
}
async function clearCachesAndReload() {
  try { if ('caches' in window) for (const key of await caches.keys()) await caches.delete(key); } catch {}
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    for (const registration of registrations ?? []) await registration.unregister();
  } catch {}
  window.location.reload();
}
export class WorldBoundary extends Component {
  state = { failed: false, terminal: false, webgl: false, retries: 0, detail: null };
  static getDerivedStateFromError(error) {
    const webgl = error?.code === 'webgl_unavailable';
    return { failed: true, terminal: webgl, webgl, detail: String(error?.message ?? error ?? 'unknown error').slice(0, 160) };
  }
  componentDidCatch(error) { console.error('scene_error', error.message); }
  componentDidMount() {
    this.timer = setInterval(() => {
      if (!this.state.failed || this.state.terminal) return;
      if (this.state.retries >= MAX_SCENE_RETRIES) this.setState({ terminal: true });
      else this.setState((s) => ({ failed: false, retries: s.retries + 1 }));
    }, 2500);
  }
  componentWillUnmount() { clearInterval(this.timer); }
  componentDidUpdate(prevProps) {
    if (this.props.resetKey !== prevProps.resetKey) this.setState({ failed: false, terminal: false, retries: 0 });
  }
  render() {
    if (this.state.terminal) {
      return <SceneRecoveryCard detail={this.state.detail} />;
    }
    if (this.state.failed) return <SceneLoading label="Reconnecting the scene" />;
    return this.props.children;
  }
}
