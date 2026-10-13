import { Component,useEffect,useRef } from 'react';
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

// Watches the render loop: if WebGL loses its context or frames stop arriving
// while the tab is visible, the scene is dead and the caller shows a recovery
// panel instead of a silent black canvas. Slow machines can spend many seconds
// on their first shader compilation, texture upload and PMREM pass, so the
// clock only starts once a frame has actually drawn and a stall must survive
// two consecutive checks before the view is declared dead.
export function SceneWatchdog({ onStopped, timeoutMs = 10000 }) {
  const { gl } = useThree();
  const last = useRef(0);
  const started = useRef(false);
  useFrame(() => { last.current = performance.now(); started.current = true; });
  useEffect(() => {
    const canvas = gl.domElement;
    const mountedAt = performance.now();
    let stopped = false;
    let misses = 0;
    const stop = (reason) => { if (!stopped) { stopped = true; onStopped(reason); } };
    const onLost = (event) => { event.preventDefault(); stop('webgl_lost'); };
    const onVisible = () => { last.current = performance.now(); misses = 0; };
    canvas.addEventListener('webglcontextlost', onLost);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.hidden) { last.current = performance.now(); misses = 0; return; }
      const now = performance.now();
      if (!started.current) {
        // Never drew a frame: allow a long grace period before calling it dead.
        if (now - mountedAt > timeoutMs * 3) stop('no_frames');
        return;
      }
      if (now - last.current > timeoutMs) {
        misses += 1;
        if (misses >= 2) stop('no_frames');
      } else {
        misses = 0;
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      canvas.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [gl, onStopped, timeoutMs]);
  return null;
}

// Recovery panel: a plain reload fixes a lost context; the lowest-graphics
// option also pins the quality preset down for weak machines before reloading;
// clearing the service worker cache fixes a tab stuck on a corrupted bundle.
export function WorldStopped({ reason }) {
  const clearAndReload = async () => {
    try { if ('caches' in window) for (const key of await caches.keys()) await caches.delete(key); } catch {}
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      for (const registration of registrations ?? []) await registration.unregister();
    } catch {}
    window.location.reload();
  };
  // Written straight to storage: the reload would otherwise cancel the React
  // state update before the settings provider persisted it.
  const reloadLowGraphics = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('moon-settings') || '{}');
      localStorage.setItem('moon-settings', JSON.stringify({ ...saved, quality: 'low', autoTune: false }));
    } catch {}
    window.location.reload();
  };
  return (
    <div className="world-fallback">
      <p>The 3D view stopped{reason === 'webgl_lost' ? ' — the graphics context was lost' : ''}.</p>
      <p>Your case is saved. Reload to bring the scene back.</p>
      <div className="world-fallback-actions">
        <button className="btn ghost" onClick={() => window.location.reload()}>Reload scene</button>
        <button className="btn ghost" onClick={reloadLowGraphics}>Reload on lowest graphics</button>
        <button className="btn ghost" onClick={clearAndReload}>Clear cache &amp; reload</button>
      </div>
    </div>
  );
}

// The loading panel is a DOM overlay pinned to the centre of the stage — never
// an in-world element, which used to drift around the frame as the camera moved.
// The bar tracks every asset three.js is fetching, with the percentage shown.
export function SceneLoading(){
  const {progress,total}=useProgress();
  const known=total>0;
  const pct=known?Math.max(0,Math.min(100,Math.round(progress))):null;
  return <div className="scene-loader" role="status" aria-live="polite" aria-label="Loading the scene">
    <div className="scene-loader-card">
      <span className="loading-moon" aria-hidden="true"/>
      <p>Opening the scene</p>
      <div className={`scene-loader-track ${pct===null?'indeterminate':''}`}>
        <span style={pct===null?undefined:{width:`${pct}%`}}/>
      </div>
      <small>{pct===null?'Preparing…':pct>=100?'Setting the stage…':`${pct}%`}</small>
    </div>
  </div>;
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
export class WorldBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('scene_error', error.message); this.props.onError?.(error); }
  // A change of resetKey retries the boundary in place, so the caller can swap
  // rooms or cinematic scenes without remounting (and rebuilding) the WebGL
  // canvas beneath it.
  componentDidUpdate(prevProps) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) {
      // A caller can hand over a working alternative (the 2D storyboard stage)
      // so a failed 3D tree never leaves the player without a scene.
      if (this.props.fallback !== undefined) return this.props.fallback;
      return <div className="world-fallback"><p>The scene could not load.</p><p>Your case is saved. You can still use Explore to inspect the room.</p><button className="btn ghost" onClick={() => this.setState({ failed: false })}>Reload scene</button></div>;
    }
    return this.props.children;
  }
}
