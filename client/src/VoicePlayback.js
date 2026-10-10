// A shared envelope follows the recorded audio clock, including pause/resume.
export const speechMotion = { character: null, audio: null, envelope: [] };
export function publishSpeech(character, audio, envelope = []) {
  Object.assign(speechMotion, { character, audio, envelope });
  window.dispatchEvent(new CustomEvent('arena-speech', { detail: { active: !!audio } }));
}
export function speechLevel(character) {
  const { audio, envelope } = speechMotion;
  if (speechMotion.character !== character || !audio || audio.paused || audio.ended) return 0;
  return envelope[Math.floor(audio.currentTime * 20)] ?? 0;
}
