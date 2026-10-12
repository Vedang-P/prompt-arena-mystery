import { useEffect, useRef } from 'react';
import { useSettings } from './Settings.jsx';

// Diegetic radio for Ramu's Cyber Cafe. The track plays from the counter
// speaker through a cheap-speaker chain — bass cut, 1.9 kHz low-pass, gentle
// soft-clip, a short room tail — and fades with the player's distance, ducking
// under dialogue. It is silent in every other room and respects Mute.
const SPEAKER = { x: -3.9, z: 2.0 };
const NEAR_M = 1.8;
const FAR_M = 9;
const NEAR_GAIN = 0.075;
const FAR_GAIN = 0.025;

// One AudioContext per page: browsers cap them, and Soundtrack remounts across
// branch changes, so creating one per mount would exhaust the hardware limit.
let sharedAudioContext = null;
function getAudioContext() {
  if (sharedAudioContext) return sharedAudioContext;
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedAudioContext = new AudioContextClass();
  return sharedAudioContext;
}

function roomImpulse(context) {
  const seconds = 1.15;
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 240 ? 0.6 : 0.35);
    }
  }
  return impulse;
}

function softClip(context) {
  const shaper = context.createWaveShaper();
  const drive = 2.2;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

function buildGraph(audio) {
  const context = getAudioContext();
  if (!context) return null;
  const source = context.createMediaElementSource(audio);
  const bassCut = context.createBiquadFilter();
  bassCut.type = 'lowshelf';
  bassCut.frequency.value = 160;
  bassCut.gain.value = -6;
  const speaker = context.createBiquadFilter();
  speaker.type = 'lowpass';
  speaker.frequency.value = 1900;
  speaker.Q.value = 0.7;
  const honk = context.createBiquadFilter();
  honk.type = 'peaking';
  honk.frequency.value = 800;
  honk.Q.value = 1;
  honk.gain.value = 3.5;
  const trebleCut = context.createBiquadFilter();
  trebleCut.type = 'highshelf';
  trebleCut.frequency.value = 2600;
  trebleCut.gain.value = -13;
  const clip = softClip(context);
  const dry = context.createGain();
  dry.gain.value = 1;
  const wet = context.createGain();
  wet.gain.value = 0.3;
  const room = context.createConvolver();
  room.buffer = roomImpulse(context);
  const out = context.createGain();
  out.gain.value = 0;
  source.connect(bassCut);
  bassCut.connect(speaker);
  speaker.connect(honk);
  honk.connect(trebleCut);
  trebleCut.connect(clip);
  clip.connect(dry);
  dry.connect(out);
  clip.connect(room);
  room.connect(wet);
  wet.connect(out);
  out.connect(context.destination);
  return { context, out };
}

export default function CafeRadio({ active = false }) {
  const { sound } = useSettings();
  const element = useRef(null);
  const graph = useRef(null);
  const ducked = useRef(false);
  const distance = useRef(FAR_M);
  const playing = active && sound;

  useEffect(() => {
    const audio = element.current;
    if (!audio) return;
    // The chain is only built the first time the cafe actually needs it, and
    // any failure leaves the room simply quiet instead of crashing the app.
    if (playing && !graph.current) {
      try { graph.current = buildGraph(audio); } catch { graph.current = null; }
    }
    const current = graph.current;
    if (!current) { audio.pause(); return; }
    const { context, out } = current;
    const setGain = () => {
      const t = Math.min(1, Math.max(0, (distance.current - NEAR_M) / (FAR_M - NEAR_M)));
      const byDistance = NEAR_GAIN + (FAR_GAIN - NEAR_GAIN) * t;
      const target = playing && !current.paused ? byDistance * (ducked.current ? 0.5 : 1) : 0;
      out.gain.setTargetAtTime(target, context.currentTime, 0.18);
    };
    const onListener = (e) => {
      const dx = (e.detail?.x ?? SPEAKER.x) - SPEAKER.x;
      const dz = (e.detail?.z ?? SPEAKER.z) - SPEAKER.z;
      distance.current = Math.hypot(dx, dz);
      setGain();
    };
    const onSpeech = (e) => { ducked.current = !!e.detail?.active; setGain(); };
    const onCue = (e) => { current.paused = !!e.detail?.paused; setGain(); };
    const resume = () => {
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (playing && audio.paused) audio.play().catch(() => {});
    };
    window.addEventListener('arena-listener', onListener);
    window.addEventListener('arena-speech', onSpeech);
    window.addEventListener('arena-cue', onCue);
    window.addEventListener('pointerdown', resume);
    let timer = null;
    if (playing) {
      resume();
      timer = setInterval(setGain, 180);
      setGain();
      if (import.meta.env.DEV) {
        window.__paCafeRadio = () => ({
          active: playing,
          elementPlaying: !audio.paused,
          context: context.state,
          gain: Number(out.gain.value.toFixed(3)),
          distance: Number(distance.current.toFixed(2)),
        });
      }
    } else {
      audio.pause();
      out.gain.setTargetAtTime(0, context.currentTime, 0.12);
    }
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('arena-listener', onListener);
      window.removeEventListener('arena-speech', onSpeech);
      window.removeEventListener('arena-cue', onCue);
      window.removeEventListener('pointerdown', resume);
    };
  }, [playing]);

  return <audio ref={element} src="/assets/audio/ambience/cafe-radio.mp3" loop preload="none" />;
}
