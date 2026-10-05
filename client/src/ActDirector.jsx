// Act Director — plays cinematic acts beat by beat. Autoplay, subtitle-driven,
// with skip, letterbox, and the phone voice-note overlay.

import { useEffect, useMemo, useRef, useState } from 'react';
import Cinema from './Cinema.jsx';

const SPEAKER_LABEL = { narrator: 'NARRATOR', voice: 'UNKNOWN VOICE' };

export default function ActDirector({ act, characters = [], onComplete, busy }) {
  const beats = useMemo(() => act?.beats ?? [], [act]);
  const names = useMemo(() => Object.fromEntries(characters.map((c) => [c.id, c.name])), [characters]);

  const [phase, setPhase] = useState('card');
  const [beatIndex, setBeatIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [fade, setFade] = useState(false);
  const timer = useRef(null);

  const beat = beats[beatIndex];
  const line = beat?.lines?.[lineIndex];

  useEffect(() => {
    if (phase !== 'card') return;
    const t = setTimeout(() => setPhase('play'), 2600);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    setLineIndex(0);
  }, [beatIndex]);

  useEffect(() => {
    if (phase !== 'play' || !beat) return;
    const perLine = Math.max(2300, (beat.seconds * 1000) / Math.max(1, beat.lines.length));
    timer.current = setTimeout(() => {
      if (lineIndex < beat.lines.length - 1) {
        setLineIndex((i) => i + 1);
      } else if (beatIndex < beats.length - 1) {
        setFade(true);
        setTimeout(() => {
          setBeatIndex((i) => i + 1);
          setFade(false);
        }, 420);
      } else {
        setPhase('end');
      }
    }, perLine);
    return () => clearTimeout(timer.current);
  }, [phase, beat, lineIndex, beatIndex, beats.length]);

  const advance = () => {
    clearTimeout(timer.current);
    if (!beat) return;
    if (lineIndex < beat.lines.length - 1) setLineIndex((i) => i + 1);
    else if (beatIndex < beats.length - 1) {
      setFade(true);
      setTimeout(() => {
        setBeatIndex((i) => i + 1);
        setFade(false);
      }, 300);
    } else setPhase('end');
  };

  if (!act) return null;

  const speakerId = line?.speaker;
  const speakerLabel = SPEAKER_LABEL[speakerId] ?? names[speakerId] ?? speakerId?.toUpperCase();
  const isNarration = speakerId === 'narrator';
  const isVoice = speakerId === 'voice';

  return (
    <div className={`cinema ${phase === 'card' ? 'cinema-card-phase' : ''}`}>
      <div className="cinema-stage">
        {phase !== 'card' && beat && (
          <Cinema sceneId={beat.room} shot={beat.shot} cast={beat.cast ?? []} />
        )}
        <div className={`cinema-fade ${fade ? 'on' : ''}`} />
        <div className="cinema-bar top" />
        <div className="cinema-bar bottom" />
      </div>

      {phase === 'card' && (
        <div className="cinema-titlecard">
          <p className="cinema-act-kicker">Act 0</p>
          <h1 className="cinema-act-title">{act.title}</h1>
          <p className="cinema-act-sub">The Moon's Dark Side</p>
        </div>
      )}

      {phase === 'play' && line && (
        <>
          <div className="cinema-subtitles">
            {beat.overlay !== 'phone_voicenote' && (
              <p className={`cinema-line ${isNarration ? 'narration' : ''} ${isVoice ? 'voice' : ''}`}>
                {!isNarration && <span className="cinema-speaker">{speakerLabel}</span>}
                {line.text}
              </p>
            )}
          </div>

          {beat.overlay === 'phone_voicenote' && (
            <div className="phone-note">
              <div className="phone-note-head">
                <span className="phone-note-from">Parth</span>
                <span className="phone-note-kind">voice note · 0:14</span>
              </div>
              <div className="phone-note-wave">
                {[...Array(28)].map((_, i) => (
                  <i key={i} style={{ height: `${18 + Math.abs(Math.sin(i * 1.7)) * 20}px`, animationDelay: `${i * 60}ms` }} />
                ))}
              </div>
              <p className="phone-note-line">{line.text}</p>
            </div>
          )}

          <div className="cinema-controls">
            <div className="cinema-progress">
              {beats.map((b, i) => (
                <span key={b.id} className={`seg ${i < beatIndex ? 'done' : ''} ${i === beatIndex ? 'active' : ''}`} />
              ))}
            </div>
            <div className="cinema-buttons">
              <button className="btn ghost" onClick={advance}>
                Continue
              </button>
              <button className="btn ghost" onClick={() => setPhase('end')}>
                Skip act
              </button>
            </div>
          </div>
        </>
      )}

      {phase === 'end' && (
        <div className="cinema-endcard">
          <p className="cinema-act-kicker">Act 0 complete</p>
          <h1 className="cinema-act-title">Act I</h1>
          <h2 className="cinema-act-subtitle">The Room</h2>
          <p className="cinema-act-hint">Parth's room is waiting. Find what he was hiding.</p>
          <button className="btn brass" onClick={() => onComplete?.()} disabled={busy}>
            {busy ? 'Entering…' : 'Enter the room'}
          </button>
        </div>
      )}
    </div>
  );
}
