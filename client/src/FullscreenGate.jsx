import { useCallback, useEffect, useRef, useState } from 'react';
import { fullscreenExit, fullscreenReturn, fullscreenUnsupported, getState } from './api.js';

// Fullscreen enforcement for event play.
//
// The gate forces fullscreen on entry, watches every way a team can leave it
// (fullscreen lost, tab hidden, page unload) and reports it to the server. The
// server grants a grace window: come back inside it and nothing happens; miss
// it and the exit becomes a strike. Three strikes disqualify — an admin can
// always clear a team, and a browser that cannot do fullscreen is never
// punished (it reports itself and the gate steps aside).

export const fullscreenSupported = () =>
  typeof document !== 'undefined' &&
  typeof document.documentElement?.requestFullscreen === 'function' &&
  document.fullscreenEnabled !== false;

export function tryEnterFullscreen() {
  if (!fullscreenSupported() || document.fullscreenElement) return;
  try {
    const request = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (request?.catch) request.catch(() => {});
  } catch {
    // The overlay's escape hatch covers browsers that refuse the request.
  }
}

const EXIT_ESCAPE_HATCH_MS = 9_000;

export default function FullscreenGate({ enabled, graceMs = 10_000, maxStrikes = 3, strikes = 0, onStrike, onDisqualified }) {
  const [supported] = useState(fullscreenSupported);
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  const [pending, setPending] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [strikeFlash, setStrikeFlash] = useState(null);
  const [escapeHatch, setEscapeHatch] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const pendingRef = useRef(false);
  const live = enabled && supported && !optedOut;

  const reportFailure = useCallback(
    (err) => {
      if (err?.status === 403 && err.data?.error === 'disqualified') onDisqualified?.(err.data);
    },
    [onDisqualified]
  );

  const exited = useCallback(
    (kind) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      setDeadline(Date.now() + graceMs);
      fullscreenExit(kind)
        .then((res) => {
          // The server owns the window: adopt its deadline so the countdown
          // and the strike verdict can never disagree.
          if (res?.deadline) setDeadline(Date.parse(res.deadline));
          // An exit can settle an earlier pending one (a reloaded tab), so the
          // count it reports is always taken.
          if (res?.strikes != null) onStrike?.(res);
          if (res?.disqualified) onDisqualified?.(res);
        })
        .catch(reportFailure);
    },
    [graceMs, onStrike, onDisqualified, reportFailure]
  );

  const returned = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    setPending(false);
    setDeadline(0);
    fullscreenReturn()
      .then((res) => {
        if (res?.late) setStrikeFlash(res.strikes);
        onStrike?.(res);
        if (res?.disqualified) onDisqualified?.(res);
      })
      .catch(reportFailure);
  }, [onStrike, onDisqualified, reportFailure]);

  useEffect(() => {
    if (!enabled) return;
    if (!supported) {
      fullscreenUnsupported().catch(() => {});
      return;
    }
    if (optedOut) return;
    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        setActive(true);
        returned();
      } else {
        setActive(false);
        exited('fullscreen');
      }
    };
    const onVisibility = () => {
      if (document.hidden) exited('hidden');
      else returned();
    };
    const onPageHide = () => {
      try {
        navigator.sendBeacon?.('/api/fullscreen/exit', new Blob([JSON.stringify({ kind: 'unload' })], { type: 'application/json' }));
      } catch {
        // A beacon is best-effort; the server also settles stale exits lazily.
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    // Note: opening the game outside fullscreen is NOT an exit — the overlay
    // simply asks the team to enter. The clock only starts once they were in
    // and then left.
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled, supported, optedOut, exited, returned]);

  // Browsers only grant fullscreen from a user gesture: catch the first one
  // anywhere on the page, and keep trying while the gate is up.
  useEffect(() => {
    if (!live || active) return;
    const onGesture = () => tryEnterFullscreen();
    window.addEventListener('pointerdown', onGesture, { capture: true });
    window.addEventListener('keydown', onGesture, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture, { capture: true });
      window.removeEventListener('keydown', onGesture, { capture: true });
    };
  }, [live, active]);

  useEffect(() => {
    if (!live || (active && !pending)) return;
    const timer = setTimeout(() => setEscapeHatch(true), EXIT_ESCAPE_HATCH_MS);
    return () => clearTimeout(timer);
  }, [live, active, pending]);

  useEffect(() => {
    if (!pending) return;
    const tick = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tick);
  }, [pending]);

  useEffect(() => {
    if (strikeFlash === null) return;
    const timer = setTimeout(() => setStrikeFlash(null), 7000);
    return () => clearTimeout(timer);
  }, [strikeFlash]);

  if (!live) return null;

  const remainingMs = Math.max(0, deadline - now);
  const remaining = Math.ceil(remainingMs / 1000);
  const expired = pending && remainingMs <= 0;
  const projected = Math.min(maxStrikes, strikes + (expired ? 1 : 0));

  return (
    <>
      {(!active || pending) && (
        <div className="fs-gate" role="dialog" aria-modal="true" aria-label="Fullscreen required">
          <section className="fs-gate-card">
            <p className="fs-gate-kicker">{pending ? 'You left the arena' : 'Arena rules'}</p>
            <h2>{pending ? (expired ? 'Return now to continue' : `Return within ${remaining}s`) : 'Fullscreen required'}</h2>
            <p className="fs-gate-body">
              {pending
                ? expired
                  ? 'The grace window has passed — this exit counts as a strike. Get back in fullscreen to keep playing.'
                  : 'Step away for a moment and the clock keeps running. Come back inside the window and nothing happens.'
                : 'Event play runs in fullscreen. Click below (or anywhere) to enter — the game is paused behind this screen.'}
            </p>
            {pending && (
              <div className="fs-gate-track" aria-hidden="true">
                <span className={expired ? 'expired' : ''} style={{ width: `${expired ? 100 : (remainingMs / graceMs) * 100}%` }} />
              </div>
            )}
            <button className="fs-gate-button" onClick={() => tryEnterFullscreen()}>
              {pending ? 'Return to fullscreen ↗' : 'Enter fullscreen ↗'}
            </button>
            <p className="fs-gate-strikes">
              Exit strikes: <strong>{projected}</strong> of {maxStrikes}
              {projected > 0 && ' — miss the window three times and the team is disqualified.'}
            </p>
            {escapeHatch && !active && (
              <button
                className="fs-gate-skip"
                onClick={() => {
                  setOptedOut(true);
                  fullscreenUnsupported().catch(() => {});
                }}
              >
                This browser will not enter fullscreen — continue without it
              </button>
            )}
          </section>
        </div>
      )}
      {strikeFlash !== null && (
        <div className="fs-strike-toast" role="status">
          Late return — strike {strikeFlash} of {maxStrikes}. {maxStrikes - strikeFlash > 0 ? `${maxStrikes - strikeFlash} more disqualifies your team.` : ''}
        </div>
      )}
    </>
  );
}

const DQ_REASON_TEXT = {
  left_fullscreen: 'The team left fullscreen three times without returning inside the ten-second window.',
  admin_decision: 'An invigilator removed this team from the event.',
};

export function DisqualifiedScreen({ info, onRequalified }) {
  const [checking, setChecking] = useState(false);
  const reason = DQ_REASON_TEXT[info?.reason] ?? 'The team was removed from the event.';

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        await getState();
        if (alive) onRequalified?.();
      } catch {
        // Still blacklisted — keep waiting for the invigilator.
      }
    };
    const timer = setInterval(check, 5000);
    check();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [onRequalified]);

  return (
    <div className="center-screen dq-screen">
      <section className="dq-card" role="alert">
        <p className="dq-kicker">Prompt Arena · Event Control</p>
        <h1>Disqualified</h1>
        <p className="dq-team">{info?.team ? `Team ${info.team}` : 'Your team'} has been removed from the arena.</p>
        <p className="dq-reason">{reason}</p>
        <dl className="dq-facts">
          <div>
            <dt>Exit strikes</dt>
            <dd>
              {info?.strikes ?? 3} of {info?.maxStrikes ?? 3}
            </dd>
          </div>
          {info?.disqualifiedAt && (
            <div>
              <dt>Recorded</dt>
              <dd>{new Date(info.disqualifiedAt).toLocaleTimeString()}</dd>
            </div>
          )}
        </dl>
        <p className="dq-help">
          This is not the end: an invigilator can review your case and clear the team. Keep this screen open — the
          game resumes by itself the moment you are back in.
        </p>
        <button className="fs-gate-button" onClick={() => { setChecking(true); getState().then(() => onRequalified?.()).catch(() => setChecking(false)); }}>
          {checking ? 'Checking…' : 'Check again now'}
        </button>
      </section>
    </div>
  );
}
