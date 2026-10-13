import { useEffect, useRef, useState } from 'react';
import CaseJournal from './CaseJournal.jsx';
import PuzzleWorkbench from './PuzzleWorkbench.jsx';
import LogoutButton from './LogoutButton.jsx';
import { useCaseDialog } from './InvestigationUI.jsx';


export function DialogueOverlay({
  character,
  subtitle,
  location,
  area,
  messages,
  typing,
  onAsk,
  disabled,
  error,
  onClose,
}) {
  const [text, setText] = useState('');
  const logRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  useCaseDialog(panelRef, onClose);
  useEffect(()=>{inputRef.current?.focus({preventScroll:true});},[]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, typing]);

  useEffect(() => {
    busyRef.current = typing;
  }, [typing]);

  const send = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || typing || disabled || busyRef.current) return;
    busyRef.current = true;
    setText('');
    onAsk(value);
  };

  // Never render an empty turn: drop contentless messages unless they are the
  // one currently streaming (those get the typing dots).
  const turns = [];
  messages.forEach((m, i) => {
    const pending = typing && i === messages.length - 1 && m.role === 'npc' && !m.content;
    if (!m.content && !pending) return;
    const prev = turns[turns.length - 1];
    turns.push({
      key: i,
      role: m.role,
      content: m.content,
      pending,
      beginsTurn: m.role === 'npc' && (!prev || prev.role === 'player'),
    });
  });
  const speakers = {
    npc: { id: character.id, name: character.name },
    player: { id: 'sameer', name: 'Sameer' },
  };

  // The interview plays over the live close-up the scene already frames, so this
  // is a transparent HUD: only its controls take pointer events.
  return (
    <section className="talk-hud" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Interview with ${character.name}`}>
      <header className="talk-location">
        <h2>{location}</h2>
        {area && <p>{area}</p>}
      </header>
      <button className="talk-leave" onClick={onClose} aria-label="Leave conversation" title="Leave conversation">
        <svg viewBox="0 0 64 40" aria-hidden="true"><path d="M2 13h34V3l26 17-26 17V27H2z" /></svg>
      </button>

      <div className="talk-log" ref={logRef} aria-live="polite">
        {turns.map((t) => {
          const who = speakers[t.role];
          return (
            <div key={t.key} className={`talk-line ${t.role}`}>
              <img className="talk-portrait" src={`/assets/portraits/${who.id}.webp`} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              <div className="talk-bubble">
                <span className="talk-speaker">{who.name}</span>
                {t.pending ? <p className="talk-typing"><i /><i /><i /></p> : <p className="talk-text">{t.content}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="talk-name">
        <h3>{character.name}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div className="talk-input">
        {error && <p className="talk-error" role="alert">{error}</p>}
        <form className="talk-ask" onSubmit={send}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={disabled ? 'The case is closed.' : 'Type here…'}
            aria-label={`Ask ${character.name}`}
            disabled={disabled}
            spellCheck={false}
          />
          <button type="submit" disabled={typing || disabled || !text.trim()}>{typing ? '…' : 'OK'}</button>
        </form>
      </div>
    </section>
  );
}

export function Notebook({ state, onClose, onInspect }) {
  return <CaseJournal state={state} onClose={onClose} onInspect={onInspect} />;
}
export function AccuseModal({ state, onClose, onSubmit, result, busy }) {
  const [culprit, setCulprit] = useState(state.characters[0]?.id ?? '');
  const [method, setMethod] = useState('');
  const [motive, setMotive] = useState('');
  const panelRef = useRef(null);
  useCaseDialog(panelRef, onClose);
  const clueLabels = {};
  for (const room of state.rooms) {
    for (const h of room.hotspots) {
      if (h.type === 'clue') clueLabels[h.clue] = h.label;
    }
  }
  return (
    <div className="case-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="case-panel accusation-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="The final accusation">
        <header className="case-panel-head">
          <div>
            <p className="case-eyebrow">The final accusation</p>
            <h2>Name the culprit</h2>
            <p className="case-header-note">Judge and jury want your conclusion, not your phrasing.</p>
          </div>
          <button className="case-close" onClick={onClose} aria-label="Close accusation">×</button>
        </header>

        <form
          className="case-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (method.trim() && motive.trim()) onSubmit({ culprit, method, motive });
          }}
        >
          <div className="case-reading-scroll accusation-body">
            <label className="case-field">
              <span className="case-answer-label">Who did it?</span>
              <select value={culprit} onChange={(e) => setCulprit(e.target.value)}>
                {state.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="case-field">
              <span className="case-answer-label">How was it done?</span>
              <textarea
                rows={3}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Describe the method in your own words…"
              />
            </label>

            <label className="case-field">
              <span className="case-answer-label">Why?</span>
              <textarea
                rows={3}
                value={motive}
                onChange={(e) => setMotive(e.target.value)}
                placeholder="Describe the motive…"
              />
            </label>

            {result && (
              <div className={`case-feedback ${result.correct ? 'complete' : 'retry'}`} role="status">
                {result.stage === 'evidence' && (
                  <p>
                    Not enough evidence. The chief wants:{' '}
                    {result.missing.map((id) => clueLabels[id] ?? id).join(', ')}
                  </p>
                )}
                {result.stage === 'culprit' && <p>That's not who did it. Go back to the case.</p>}
                {result.stage === 'conclusion' && (
                  <p>
                    Your story doesn't hold up.
                    {result.checks && (
                      <>
                        {' '}
                        Method: {result.checks.method ? 'sound' : 'not convincing'}. Motive:{' '}
                        {result.checks.motive ? 'sound' : 'not convincing'}.
                      </>
                    )}
                  </p>
                )}
                {result.correct && <p>The case is closed.</p>}
              </div>
            )}
          </div>

          <footer className="case-panel-foot">
            <p>Your accusation is final</p>
            <div className="case-footer-actions">
              <button type="button" className="case-button" onClick={onClose}>
                Keep digging
              </button>
              <button className="case-button primary" type="submit" disabled={busy}>
                {busy ? 'The chief is reading…' : 'Accuse →'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function PuzzleModal(props) {
  return <PuzzleWorkbench {...props} />;
}

export function RestartConfirm({ onClose, onConfirm, busy }) {
  const panelRef = useRef(null);
  useCaseDialog(panelRef, onClose);
  return <div className="case-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="case-panel restart-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Restart the case">
      <header className="case-panel-head">
        <div><p className="case-eyebrow">Reopen the case</p><h2>Start again from Act 0?</h2></div>
        <button className="case-close" onClick={onClose} aria-label="Close restart dialog">×</button>
      </header>
      <div className="case-reading-scroll">
        <p className="case-reading-text">Everything collected so far is cleared — evidence, resolved leads, the accusation — and the story begins again at the prologue.</p>
        <p className="case-reading-text">A restart adds <strong>10 penalties</strong> to your score in an event run (practice restarts are free), and the event clock keeps running. The notebook cannot be recovered.</p>
      </div>
      <footer className="case-panel-foot">
        <p>This cannot be undone</p>
        <div className="case-footer-actions">
          <button className="case-button" onClick={onClose}>Keep my progress</button>
          <button className="case-button primary" onClick={onConfirm} disabled={busy}>{busy ? 'Reopening…' : 'Restart from Act 0 ↺'}</button>
        </div>
      </footer>
    </section>
  </div>;
}

const ENDING_FALLBACK = {
  ending_main: [
    'The game has ended. Sameer can leave. Before it restarts, he can go back to his life.',
    'Sameer closes his eyes. He breathes.',
  ],
  ending_cult: [
    'The story ends here. The cult steadily grows, bringing everything around it — including the police and local politicians — under its complete control.',
    'It spreads like an unstoppable virus. Sameer never gets his answers.',
  ],
};

export function EndingCard({ ending, score, penalties, team, title, onReplay, onRestart }) {
  if (!ending) return null;
  const fallback = ENDING_FALLBACK[ending.id] ?? ['The case goes cold.'];
  const paragraphs = String(ending.body ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const body = paragraphs.length ? paragraphs : fallback;
  const isMain = ending.id === 'ending_main';
  const hasPing = /now disappear/i.test(body.join(' '));
  return (
    <div className="ending-screen">
      <div className="ending-card">
        <p className="ending-kicker">{isMain ? 'The case is closed' : 'The case goes cold'}</p>
        <h1 className="ending-title">{ending.title ?? (isMain ? 'Solved' : 'An Ending')}</h1>
        <div className="ending-ornament">◆ ◆ ◆</div>
        <div className="ending-body">
          {body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {isMain && !hasPing && (
            <p className="ending-ping">
              His phone pings. What? The story was supposed to end. It's another voice note: “now
              disappear.”
            </p>
          )}
        </div>
        <div className="ending-stats">
          <span className="ending-stat">
            Score <b>{score ?? 0}</b>
          </span>
          <span className="ending-stat">
            Penalties <b>{penalties ?? 0}</b>
          </span>
        </div>
        <p className="ending-team">
          {title} — Team {team}
        </p>
        {onRestart && (
          <button className="btn brass" onClick={onRestart}>
            Restart the case ↺
          </button>
        )}
        {onReplay && (
          <button className="btn ghost" onClick={onReplay}>
            Back to the title
          </button>
        )}
        <LogoutButton className="btn ghost"/>
      </div>
    </div>
  );
}

export function Notice({ notice, onClose }) {
  return (
    <div className="toast" onClick={onClose}>
      {notice.page && <img className="toast-page" src={notice.page} alt="" />}
      <p className="toast-kicker">{notice.kicker ?? 'Case file updated'}</p>
      <strong className="toast-title">{notice.title}</strong>
      {notice.body && <p className="toast-body">{notice.body}</p>}
      {notice.facts?.length > 0 && (
        <ul className="toast-facts">
          {notice.facts.map((f) => (
            <li key={f.fact}>{f.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
