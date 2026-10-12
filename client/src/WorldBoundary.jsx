import { Component,useEffect,useRef } from 'react';
import { Html } from '@react-three/drei';
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
// panel instead of a silent black canvas.
export function SceneWatchdog({ onStopped, timeoutMs = 4000 }) {
  const { gl } = useThree();
  const last = useRef(performance.now());
  useFrame(() => { last.current = performance.now(); });
  useEffect(() => {
    const canvas = gl.domElement;
    let stopped = false;
    const stop = (reason) => { if (!stopped) { stopped = true; onStopped(reason); } };
    const onLost = (event) => { event.preventDefault(); stop('webgl_lost'); };
    const onVisible = () => { last.current = performance.now(); };
    canvas.addEventListener('webglcontextlost', onLost);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.hidden) { last.current = performance.now(); return; }
      if (performance.now() - last.current > timeoutMs) stop('no_frames');
    }, 1000);
    return () => {
      clearInterval(timer);
      canvas.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [gl, onStopped, timeoutMs]);
  return null;
}

// Recovery panel: a plain reload fixes a lost context; clearing the service
// worker cache also fixes a tab stuck on a corrupted cached bundle.
export function WorldStopped({ reason }) {
  const clearAndReload = async () => {
    try { if ('caches' in window) for (const key of await caches.keys()) await caches.delete(key); } catch {}
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      for (const registration of registrations ?? []) await registration.unregister();
    } catch {}
    window.location.reload();
  };
  return (
    <div className="world-fallback">
      <p>The 3D view stopped{reason === 'webgl_lost' ? ' — the graphics context was lost' : ''}.</p>
      <p>Your case is saved. Reload to bring the scene back.</p>
      <div className="world-fallback-actions">
        <button className="btn ghost" onClick={() => window.location.reload()}>Reload scene</button>
        <button className="btn ghost" onClick={clearAndReload}>Clear cache &amp; reload</button>
      </div>
    </div>
  );
}

export function SceneLoading() {
  return <Html center><div className="world-loading"><span className="loading-moon" /><p>Opening the scene</p></div></Html>;
}
export class WorldBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('scene_error', error.message); }
  render() {
    if (this.state.failed) return <div className="world-fallback"><p>The scene could not load.</p><p>Your case is saved. You can still use Explore to inspect the room.</p><button className="btn ghost" onClick={() => this.setState({ failed: false })}>Reload scene</button></div>;
    return this.props.children;
  }
}
