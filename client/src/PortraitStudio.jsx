// Loaded only in Vite development (/play/?portraits=<id>). Frames one cast rig
// head-and-shoulders on a transparent canvas so scripts/make-portraits.mjs can
// capture the interview avatars from the same models the game stages.
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import HumanActor from './HumanActor.jsx';
import measurements from '../public/assets/cast/measurements.json';

function Ready() {
  const frames = useRef(0);
  // Let the idle clip blend in before the capture is allowed.
  useFrame(() => { if (++frames.current === 90) window.__portraitReady = true; });
  return null;
}

export default function PortraitStudio() {
  const id = new URLSearchParams(location.search).get('portraits');
  const head = measurements[id]?.standingHead?.[2] ?? 1.55;
  const look = [0, head + 0.05, 0];
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, background: 'transparent' }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ position: [0.04, head + 0.08, 1.1], fov: 25 }}
      onCreated={({ camera }) => camera.lookAt(...look)}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[1.4, 2.4, 2]} intensity={2.2} />
      <directionalLight position={[-1.8, 1.8, -1.2]} intensity={1.1} color="#d4b67c" />
      <Suspense fallback={null}>
        <HumanActor character={id} />
        <Ready />
      </Suspense>
    </Canvas>
  );
}
