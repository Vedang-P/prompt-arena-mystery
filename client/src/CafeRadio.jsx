import { useEffect, useRef } from 'react';
import { useSettings } from './Settings.jsx';

// Diegetic radio for Ramu's Cyber Cafe. The track plays from the counter
// speaker through a cheap-speaker chain — bass cut, 2.8 kHz low-pass, gentle
// soft-clip, a short room tail — and fades with the player's distance, ducking
// under dialogue. It is silent in every other room and respects Mute.
const SPEAKER = { x: -3.9, z: 2.0 };
const NEAR_M = 1.8;
const FAR_M = 9;
const NEAR_GAIN = 0.075;
const FAR_GAIN = 0.025;

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

export default function CafeRadio({ active = false }) {
  const { sound } = useSettings();
  const element = useRef(null);
  const graph = useRef(null);
  const ducked = useRef(false);
  const distance = useRef(FAR_M);
  const playing = active && sound;

  // Build the speaker chain once; activation only moves the output gain.
  useEffect(() => {
    const audio = element.current;
    if (!audio || graph.current) return;
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
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
    graph.current = { context, out };
  }, []);

  useEffect(() => {
    const audio = element.current;
    const current = graph.current;
    if (!audio || !current) return;
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
    if (playing) {
      resume();
      const timer = setInterval(setGain, 180);
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
      return () => {
        clearInterval(timer);
        window.removeEventListener('arena-listener', onListener);
        window.removeEventListener('arena-speech', onSpeech);
        window.removeEventListener('arena-cue', onCue);
        window.removeEventListener('pointerdown', resume);
        audio.pause();
        out.gain.setTargetAtTime(0, context.currentTime, 0.12);
      };
    }
    audio.pause();
    out.gain.setTargetAtTime(0, context.currentTime, 0.12);
    return () => {
      window.removeEventListener('arena-listener', onListener);
      window.removeEventListener('arena-speech', onSpeech);
      window.removeEventListener('arena-cue', onCue);
      window.removeEventListener('pointerdown', resume);
    };
  }, [playing]);

  return <audio ref={element} src="/assets/audio/ambience/cafe-radio.mp3" loop preload="none" />;
}
