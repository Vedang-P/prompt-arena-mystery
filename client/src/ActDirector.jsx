// Act Director — plays cinematic acts beat by beat. Autoplay, subtitle-driven,
// with skip, letterbox, and the phone voice-note overlay.
//
// mode="beats" (default): 3D shot scenes driven by act.beats (Act 0 and any
// future cinematic). mode="story": text-only letterboxed overlay for
// act.intro/outro lines — no 3D canvas, used by App if it prefers this over
// the separate StoryOverlay component.

import { useEffect, useMemo, useRef, useState } from 'react';
import Cinema, { BACKDROPS } from './Cinema.jsx';
import { useSettings } from './Settings.jsx';

const SPEAKER_LABEL = { narrator: 'NARRATOR', voice: 'UNKNOWN VOICE' };
const DEFAULT_KICKER = 'Act 0';
const DEFAULT_SUBTITLE = "The Moon's Dark Side";

function labelFor(speakerId, names) {
  return SPEAKER_LABEL[speakerId] ?? names[speakerId] ?? speakerId?.toUpperCase();
}

export default function ActDirector({
  act,
  characters = [],
  onComplete,
  busy,
  mode = 'beats',
  lines = null,
  backdrop = null,
  nextActTitle = null,
  nextActKicker = null,
  endLabel = null,
  doneLabel = null,
  onDone = null,
}) {
  const isBeats = mode !== 'story';
  const beats = useMemo(() => act?.beats ?? [], [act]);
  const names = useMemo(() => Object.fromEntries(characters.map((c) => [c.id, c.name])), [characters]);

  // Dev aid: ?beat=<id> jumps straight to a beat (used by the screenshot harness).
  const startIndex = useMemo(() => {
    const id = new URLSearchParams(window.location.search).get('beat');
    if (!id) return 0;
    const idx = beats.findIndex((b) => b.id === id);
    return idx === -1 ? 0 : idx;
  }, [beats]);

  const [phase, setPhase] = useState(startIndex > 0 ? 'play' : 'card');
  const [beatIndex, setBeatIndex] = useState(startIndex);
  const [lineIndex, setLineIndex] = useState(0);
  const [fade, setFade] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const timer = useRef(null);
  const [paused, setPaused] = useState(false);
  const { narration } = useSettings();

  const beat = beats[beatIndex];
  const line = beat?.lines?.[lineIndex];

  // Story mode lines: prop > act.intro > act.outro; plain strings are allowed.
  const storyLines = useMemo(() => {
    if (isBeats) return [];
    const src = lines ?? act?.intro ?? act?.outro ?? [];
    if (!Array.isArray(src)) return [];
    return src
      .map((l) => (typeof l === 'string' ? { speaker: 'narrator', text: l } : l))
      .filter((l) => l && l.text);
  }, [isBeats, lines, act]);

  useEffect(() => {
    if (!isBeats || phase !== 'card' || paused) return;
    const t = setTimeout(() => setPhase('play'), 2600);
    return () => clearTimeout(t);
  }, [isBeats, phase, paused]);

  useEffect(() => {
    setLineIndex(0);
  }, [beatIndex]);

  useEffect(() => {
    if (!isBeats || phase !== 'play' || !beat || paused) return;
    const perLine = Math.max(3500, (line?.text?.length ?? 0) * 55, (beat.seconds * 1000) / Math.max(1, beat.lines.length));
    timer.current = setTimeout(() => {
      if (lineIndex < beat.lines.length - 1) {
        setLineIndex((i) => i + 1);
      } else if (beatIndex < beats.length - 1) {
        setBeatIndex((i) => i + 1);
      } else {
        setPhase('end');
      }
    }, perLine);
    return () => clearTimeout(timer.current);
  }, [isBeats, phase, beat, lineIndex, beatIndex, beats.length, paused]);

  useEffect(() => {
    if (!narration || paused || phase !== 'play' || !line || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(line.text); utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [line, narration, paused, phase]);

  const advance = () => {
    clearTimeout(timer.current);
    if (phase === 'card') { setPhase('play'); return; }
    if (!beat) return;
    if (lineIndex < beat.lines.length - 1) setLineIndex((i) => i + 1);
    else if (beatIndex < beats.length - 1) {
      setBeatIndex((i) => i + 1);
    } else setPhase('end');
  };

  useEffect(() => {
    if (!isBeats) return;
    const key = (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !['BUTTON', 'INPUT'].includes(e.target.tagName)) {
        e.preventDefault(); if (phase === 'end') { if (!busy) onComplete?.(); } else advance();
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  if (!isBeats) {
    if (!act && !lines) return null;

    const storyLine = storyLines[storyIndex];
    const storyIsLast = storyIndex >= storyLines.length - 1;
    const finishStory = () => (onDone ?? onComplete)?.();

    const storyAdvance = () => {
      if (storyIsLast) finishStory();
      else setStoryIndex((i) => i + 1);
    };

    const rawBackdrop = backdrop ?? act?.backdrop ?? null;
    const mapped =
      typeof rawBackdrop === 'string' && rawBackdrop && !rawBackdrop.includes('/')
        ? BACKDROPS[rawBackdrop] ?? rawBackdrop
        : rawBackdrop;
    const isGradient = typeof mapped === 'string' && mapped.includes('gradient(');

    const speakerId = storyLine?.speaker;
    const speaker = labelFor(speakerId, names);
    const isNarration = speakerId === 'narrator';
    const isVoice = speakerId === 'voice';

    return (
      <div className="cinema story-mode">
        <div className="cinema-stage story-stage" onClick={storyAdvance}>
          {mapped ? (
            <div
              className="story-backdrop"
              style={{ backgroundImage: isGradient ? mapped : `url(${mapped})` }}
            />
          ) : (
            <div className="story-backdrop story-backdrop-fallback" />
          )}
          <div className="story-shade" />
          <div className="cinema-bar top" />
          <div className="cinema-bar bottom" />

          <div className="story-lines">
            {storyLine && (
              <p
                key={storyIndex}
                className={`cinema-line story-line ${isNarration ? 'narration' : ''} ${isVoice ? 'voice' : ''}`}
              >
                {!isNarration && <span className="cinema-speaker">{speaker}</span>}
                {storyLine.text}
              </p>
            )}
          </div>
        </div>

        <div className="cinema-controls story-controls">
          <div className="cinema-progress">
            {storyLines.map((l, i) => (
              <span key={i} className={`seg ${i < storyIndex ? 'done' : ''} ${i === storyIndex ? 'active' : ''}`} />
            ))}
          </div>
          <div className="cinema-buttons">
            {storyIsLast ? (
              <button className="btn brass" onClick={finishStory} disabled={busy}>
                {busy ? 'One moment…' : doneLabel ?? endLabel ?? 'Begin'}
              </button>
            ) : (
              <>
                <button className="btn ghost" onClick={storyAdvance}>
                  Continue
                </button>
                <button className="btn ghost" onClick={finishStory} disabled={busy}>
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!act) return null;

  const speakerId = line?.speaker;
  const speaker = labelFor(speakerId, names);
  const isNarration = speakerId === 'narrator';
  const isVoice = speakerId === 'voice';
  const isVoicenote = beat?.overlay === 'phone_voicenote' || beat?.overlay === 'voicenote_alt';

  return (
    <div className={`cinema ${phase === 'card' ? 'cinema-card-phase' : ''}`}>
      <div className="cinema-stage">
        {phase !== 'card' && beat && (
          <Cinema sceneId={beat.room} shot={beat.shot} cast={beat.cast ?? []} speaker={speakerId} />
        )}
        <div className={`cinema-fade ${fade ? 'on' : ''}`} />
        <div className="cinema-bar top" />
        <div className="cinema-bar bottom" />
      </div>

      {phase === 'card' && (
        <div className="cinema-titlecard">
          <p className="cinema-act-kicker">{act.kicker ?? DEFAULT_KICKER}</p>
          <h1 className="cinema-act-title">{act.title}</h1>
          <p className="cinema-act-sub">{act.subtitle ?? DEFAULT_SUBTITLE}</p>
        </div>
      )}

      {phase === 'play' && line && (
        <>
          <div className="cinema-subtitles">
            {!isVoicenote && (
              <p className={`cinema-line ${isNarration ? 'narration' : ''} ${isVoice ? 'voice' : ''}`}>
                {!isNarration && <span className="cinema-speaker">{speaker}</span>}
                {line.text}
              </p>
            )}
          </div>

          {isVoicenote && (
            <div className={`phone-note ${beat.overlay === 'voicenote_alt' ? 'alt' : ''}`}>
              <div className="phone-note-head">
                <span className="phone-note-from">{beat.noteFrom ?? 'Parth'}</span>
                <span className="phone-note-kind">{beat.noteKind ?? 'voice note · 0:14'}</span>
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
              <button className="btn ghost" onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button>
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
          <p className="cinema-act-kicker">{`${act.kicker ?? DEFAULT_KICKER} complete`}</p>
          {nextActKicker || nextActTitle ? (
            <>
              <h1 className="cinema-act-title">{nextActKicker ?? nextActTitle}</h1>
              {nextActKicker && nextActTitle && <h2 className="cinema-act-subtitle">{nextActTitle}</h2>}
            </>
          ) : (
            <h1 className="cinema-act-title">{act.title}</h1>
          )}
          {act.subtitle && <p className="cinema-act-hint">{act.subtitle}</p>}
          <button className="btn brass" onClick={() => onComplete?.()} disabled={busy}>
            {busy ? 'Entering…' : endLabel ?? 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}
