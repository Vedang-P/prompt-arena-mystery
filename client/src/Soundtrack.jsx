import { useEffect, useRef } from 'react';
import { useSettings } from './Settings.jsx';
export default function Soundtrack({ roomId = 'gazebo' }) {
  const { sound } = useSettings();
  const graph = useRef(null);
  useEffect(() => {
    if (!sound) { graph.current?.context.close(); graph.current = null; return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const gain = context.createGain(); gain.gain.value = 0.025; gain.connect(context.destination);
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450; filter.connect(gain);
    const oscillators = [110, 164.81, 220.13].map((freq, i) => {
      const o = context.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = freq; o.connect(filter); o.start(); return o;
    });
    const lfo = context.createOscillator(); lfo.frequency.value = 0.09;
    const depth = context.createGain(); depth.gain.value = 70; lfo.connect(depth); depth.connect(filter.frequency); lfo.start();
    graph.current = { context, filter, oscillators };
    const resume = () => context.resume().catch(() => {});
    window.addEventListener('pointerdown', resume); window.addEventListener('keydown', resume);
    resume();
    return () => { window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); context.close().catch(() => {}); graph.current = null; };
  }, [sound]);
  useEffect(() => {
    const audio = graph.current; if (!audio) return;
    const tense = ['hospital', 'ngo_archive', 'tanush_office'].includes(roomId);
    audio.filter.frequency.setTargetAtTime(tense ? 230 : 500, audio.context.currentTime, 1.5);
    audio.oscillators[1].frequency.setTargetAtTime(tense ? 155.56 : 164.81, audio.context.currentTime, 2);
  }, [roomId, sound]);
  return null;
}
