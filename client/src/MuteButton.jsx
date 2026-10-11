import { useSettings } from './Settings.jsx';

const STASH = 'moon-settings-before-mute';

/* One-tap silence: stashes the player's soundtrack/voice preferences, turns both
   off, and restores them on the way back. */
export default function MuteButton({ className = 'quiet-button' }) {
  const { sound, narration, update } = useSettings();
  const muted = !sound && !narration;

  const toggle = () => {
    if (muted) {
      let previous = { sound: true, narration: true };
      try {
        const raw = localStorage.getItem(STASH);
        if (raw) previous = { ...previous, ...JSON.parse(raw) };
      } catch {}
      update({ sound: !!previous.sound, narration: !!previous.narration });
      return;
    }
    try {
      localStorage.setItem(STASH, JSON.stringify({ sound, narration }));
    } catch {}
    window.speechSynthesis?.cancel();
    update({ sound: false, narration: false });
  };

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-pressed={muted}
      title={muted ? 'Bring back the music and voices' : 'Silence the music and voices'}
    >
      {muted ? 'Unmute audio' : 'Mute audio'}
    </button>
  );
}
