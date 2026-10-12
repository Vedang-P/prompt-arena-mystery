import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSettings } from './Settings.jsx';

const ORDER = ['high', 'medium', 'low'];
const WINDOW_SECONDS = 5;
const SLOW_FPS = 26;

// Watches the real render loop and steps the graphics preset down when the
// machine cannot hold a playable frame rate, so weak laptops settle on a
// setting their GPU can actually draw instead of stalling through a preset
// they were only assumed to handle. A manual change in settings turns the
// auto-tune off so the player's choice is never fought.
export default function PerformanceGuard() {
  const { quality, autoTune, update } = useSettings();
  const meter = useRef({ elapsed: 0, frames: 0, slowWindows: 0 });
  useFrame((_, delta) => {
    const state = meter.current;
    if (!autoTune || quality === 'low' || document.hidden) return;
    if (!(delta > 0) || delta > 1) { state.elapsed = 0; state.frames = 0; return; }
    state.elapsed += delta;
    state.frames += 1;
    if (state.elapsed < WINDOW_SECONDS) return;
    const fps = state.frames / state.elapsed;
    state.elapsed = 0;
    state.frames = 0;
    if (fps >= SLOW_FPS) { state.slowWindows = 0; return; }
    state.slowWindows += 1;
    if (state.slowWindows < 2) return;
    state.slowWindows = 0;
    const next = ORDER[Math.min(ORDER.indexOf(quality) + 1, ORDER.length - 1)];
    if (next === quality) return;
    console.info(`arena_quality ${quality} -> ${next} (${fps.toFixed(1)} fps)`);
    update({ quality: next });
  });
  return null;
}
