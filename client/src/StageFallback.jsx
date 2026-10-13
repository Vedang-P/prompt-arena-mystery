import { useEffect, useRef, useState } from 'react';
import './stage-fallback.css';

// The 2D storyboard stage: every scene and every room is drawn with the DOM —
// painted backdrop where the game ships one, a colour-graded set where it does
// not, and cast portraits lit like actors on a stage. It requires no WebGL at
// all, so a machine with 3D graphics switched off still gets the full story.
// This module is deliberately small and dependency-free so it can never fail
// for the same reason the 3D canvas did.

const portraitFor = (id) => `/assets/portraits/${id}.webp`;

const BACKDROPS = {
  gazebo: '/assets/pictures/backdrop_gazebo.jpg',
  police_station: '/assets/pictures/backdrop_police.jpg',
  sameer_room: '/assets/pictures/backdrop_bedroom.jpg',
  parth_room: '/assets/pictures/backdrop_bedroom.jpg',
};

// The shots the director can ask for. close_* frames one actor; anything else
// keeps the whole cast readable.
const CLOSE = { close_parth: 'parth', close_mother: 'mother', close_officer: 'officer', close_desk: 'sameer' };

function focusOf(shot, speaker) {
  if (speaker && !['narrator', 'voice'].includes(speaker)) return speaker;
  return CLOSE[shot] ?? null;
}

// Where each actor stands on the flat stage. Wide shots spread the cast; a
// close shot pulls the focus to the lit side and dims everyone else to the
// wings, the way the 3D camera frames a portrait.
function actorSlots(people, focus, close) {
  const n = people.length;
  const spread = n === 1 ? [52] : n === 2 ? [34, 68] : n === 3 ? [24, 50, 76] : [18, 40, 60, 82];
  return people.map((person, i) => {
    const isFocus = Boolean(focus) && person.character === focus;
    const wing = i % 2 ? 96 : 4;
    const left = close && focus ? (isFocus ? 60 : wing) : (spread[i] ?? 12 + (76 * i) / Math.max(1, n - 1));
    return { left, isFocus, far: Boolean(close && focus && !isFocus), seated: person.pose === 'sit' || person.pose === 'lie' };
  });
}

function ActorFigure({ character, slot, index, speaking }) {
  return (
    <figure
      className={`fs-actor${slot.isFocus ? ' is-focus' : ''}${slot.far ? ' is-far' : ''}${slot.seated ? ' is-seated' : ''}${speaking ? ' is-speaking' : ''}`}
      style={{ '--fs-x': `${slot.left}%`, '--fs-delay': `${index * 320}ms` }}
      aria-hidden="true"
    >
      <span className="fs-glow" />
      <img
        src={portraitFor(character)}
        alt=""
        draggable={false}
        onError={(e) => { const actor = e.currentTarget.parentElement; if (actor) actor.style.display = 'none'; }}
      />
    </figure>
  );
}

function StageArt({ roomId, backdrop }) {
  return (
    <>
      {backdrop && <img className="fs-backdrop" src={backdrop} alt="" draggable={false} />}
      <div className="fs-set" />
    </>
  );
}

// Cinematic stage: used by Cinema3D everywhere the WebGL canvas cannot draw.
export default function FallbackCinema({ sceneId = 'gazebo', shot = 'wide', cast = [], speaker, paused = false, onReady }) {
  const backdrop = BACKDROPS[sceneId];
  const close = shot !== 'wide' && shot !== 'two';
  const focus = focusOf(shot, speaker);
  const slots = actorSlots(cast, focus, close);
  const [open, setOpen] = useState(!backdrop);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  // The director waits for the stage before rolling; the 2D stage is up as
  // soon as it paints, so announce readiness right away instead of stalling
  // the story on assets the player does not need.
  useEffect(() => {
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => readyRef.current?.()); });
    const safety = setTimeout(() => readyRef.current?.(), 900);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [sceneId]);

  useEffect(() => {
    if (!backdrop) { setOpen(true); return; }
    let alive = true;
    setOpen(false);
    const image = new Image();
    const reveal = () => { if (alive) setOpen(true); };
    image.onload = reveal;
    image.onerror = reveal;
    image.src = backdrop;
    const safety = setTimeout(reveal, 1600);
    return () => { alive = false; clearTimeout(safety); };
  }, [backdrop]);

  return (
    <figure
      className={`fs-stage fs-room-${sceneId}${backdrop ? ' has-backdrop' : ''} fs-shot-${close ? 'close' : shot}${paused ? ' is-paused' : ''}`}
      data-scene={sceneId}
      aria-label={`Scene: ${sceneId}`}
    >
      <div className="fs-camera">
        <StageArt roomId={sceneId} backdrop={backdrop} />
        <div className="fs-cast">
          {cast.map((person, i) => (
            <ActorFigure key={`${person.character}-${i}`} character={person.character} slot={slots[i]} index={i} speaking={person.character === speaker} />
          ))}
        </div>
      </div>
      <div className="fs-grade" aria-hidden="true" />
      <div className={`fs-curtain${open ? ' is-open' : ''}`} aria-hidden="true" />
    </figure>
  );
}

// Storyboard room view: replaces the interactive 3D room when the stage is 2D.
// The hotspot dock carries every interaction the room offers, so the case is
// fully playable with keyboard, touch or mouse — no canvas required.
export function RoomFallback({ room, roomId, state, solvedPuzzles = [], onCharacter, onClue, onPuzzle, onTravel, notice, onRetry }) {
  if (!room) return null;
  const id = roomId ?? room.id;
  const backdrop = BACKDROPS[id];
  const discovered = new Set(state?.discovered ?? []);
  const solved = new Set(solvedPuzzles);
  const hotspots = room.hotspots ?? [];
  const people = hotspots
    .filter((h) => h.type === 'character')
    .map((h) => ({ character: h.character, pose: h.character === 'officer' ? 'sit' : 'idle' }));
  const slots = actorSlots(people, null, false);
  const open = (hotspot) => {
    if (hotspot.type === 'clue') onClue?.(hotspot);
    else if (hotspot.type === 'puzzle') onPuzzle?.(hotspot);
    else if (hotspot.type === 'character') onCharacter?.(hotspot);
    else onTravel?.(hotspot);
  };
  const iconFor = (hotspot, done) => (done ? '✓' : hotspot.type === 'clue' ? '◇' : hotspot.type === 'character' ? '◉' : hotspot.type === 'travel' ? '↗' : '⌘');
  const kindFor = (hotspot, done) => (done ? 'Logged · inspect again' : hotspot.type === 'clue' ? 'Evidence' : hotspot.type === 'puzzle' ? 'Investigate' : hotspot.type === 'character' ? 'Talk' : 'Travel');
  return (
    <div className={`fs-stage room-fallback fs-room-${id}${backdrop ? ' has-backdrop' : ''} fs-shot-wide`} data-scene={id}>
      <div className="fs-camera">
        <StageArt roomId={id} backdrop={backdrop} />
        <div className="fs-cast">
          {people.map((person, i) => (
            <ActorFigure key={`${person.character}-${i}`} character={person.character} slot={slots[i]} index={i} speaking={false} />
          ))}
        </div>
      </div>
      <div className="fs-grade" aria-hidden="true" />
      {notice && (
        <div className="fs-notice" role="status">
          <span>{notice}</span>
          {onRetry && <button className="btn ghost" onClick={onRetry}>Try 3D again</button>}
        </div>
      )}
      <aside className="fs-dock" aria-label={`${room.name ?? 'Room'} — inspect and follow leads`}>
        <header>
          <p className="case-eyebrow">Storyboard view</p>
          <h2>{room.name}</h2>
          <p className="case-muted">Inspect an object or follow a lead.</p>
        </header>
        <div className="fs-dock-list">
          {hotspots.map((hotspot) => {
            const done = hotspot.type === 'clue' ? discovered.has(hotspot.clue) : hotspot.type === 'puzzle' ? solved.has(hotspot.puzzle) : false;
            return (
              <button key={hotspot.id} className={`fs-dock-item${done ? ' done' : ''}`} onClick={() => open(hotspot)}>
                <span className={`interaction-icon ${hotspot.type}`}>{iconFor(hotspot, done)}</span>
                <span className="fs-dock-text"><strong>{hotspot.label}</strong><small>{kindFor(hotspot, done)}</small></span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
