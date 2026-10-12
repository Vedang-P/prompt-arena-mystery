import { useSettings } from './Settings.jsx';

const STASH = 'moon-settings-before-mute';

/* One-tap silence: stashes the player's soundtrack preference, turns it off,
   and restores it on the way back. */
export default function MuteButton({ className = 'quiet-button' }) {
  const { sound, update } = useSettings();
  const muted = !sound;

  const toggle = () => {
    if (muted) {
      let previous = { sound: true };
      try {
        const raw = localStorage.getItem(STASH);
        if (raw) previous = { ...previous, ...JSON.parse(raw) };
      } catch {}
      update({ sound: !!previous.sound });
      return;
    }
    try {
      localStorage.setItem(STASH, JSON.stringify({ sound }));
    } catch {}
    update({ sound: false });
  };

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-pressed={muted}
      title={muted ? 'Bring back the music' : 'Silence the music'}
    >
      {muted ? 'Unmute audio' : 'Mute audio'}
    </button>
  );
}
