import { useEffect, useState } from 'react';
import { getState } from './api.js';

const DQ_REASON_TEXT = {
  admin_decision: 'An invigilator removed this team from the event.',
};

export function DisqualifiedScreen({ info, onRequalified }) {
  const [checking, setChecking] = useState(false);
  const [expired, setExpired] = useState(false);
  const reason = DQ_REASON_TEXT[info?.reason] ?? 'The team was removed from the event.';

  useEffect(() => {
    if (expired) return;
    let alive = true;
    const check = async () => {
      try {
        await getState();
        if (alive) onRequalified?.();
      } catch (e) {
        // A dead session can never requalify: say so instead of waiting forever.
        if (alive && e?.status === 401) setExpired(true);
      }
    };
    const timer = setInterval(check, 5000);
    check();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [onRequalified, expired]);

  return (
    <div className="center-screen dq-screen">
      <section className="dq-card" role="alert">
        <p className="dq-kicker">Prompt Arena · Event Control</p>
        <h1>Disqualified</h1>
        <p className="dq-team">{info?.team ? `Team ${info.team}` : 'Your team'} has been removed from the arena.</p>
        <p className="dq-reason">{reason}</p>
        {info?.disqualifiedAt && (
          <dl className="dq-facts">
            <div>
              <dt>Recorded</dt>
              <dd>{new Date(info.disqualifiedAt).toLocaleTimeString()}</dd>
            </div>
          </dl>
        )}
        <p className="dq-help">
          {expired
            ? 'Your session has ended. Sign in again to keep this screen live.'
            : 'This is not the end: an invigilator can review your case and clear the team. Keep this screen open — the game resumes by itself the moment you are back in.'}
        </p>
        {expired ? (
          <a className="dq-button" href="/">Sign in again ↗</a>
        ) : (
          <button className="dq-button" onClick={() => { setChecking(true); getState().then(() => onRequalified?.()).catch((e) => { if (e?.status === 401) setExpired(true); setChecking(false); }); }}>
            {checking ? 'Checking…' : 'Check again now'}
          </button>
        )}
      </section>
    </div>
  );
}
