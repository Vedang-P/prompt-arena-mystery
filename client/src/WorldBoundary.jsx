import { Component,useRef } from 'react';
import { Html } from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
export function SceneReady({onReady,onMetrics}){
  const callback=useRef(onReady),elapsed=useRef(0),done=useRef(false);callback.current=onReady;
  const sample=useRef([]);
  // Let WebGL draw and the initial animation blend settle before announcing it.
  useFrame(({gl},dt)=>{elapsed.current+=Math.min(dt,.05);if(!done.current&&elapsed.current>=.36){done.current=true;callback.current?.();}
    if(import.meta.env.DEV&&onMetrics&&done.current&&dt>0&&dt<1){sample.current.push(dt);if(sample.current.length===60){const times=sample.current.splice(0).sort((a,b)=>a-b);onMetrics({fps:Math.round(60/times.reduce((a,b)=>a+b,0)),p95:Math.round(times[56]*1000),geometries:gl.info.memory.geometries,textures:gl.info.memory.textures});}}
  });
  return null;
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
