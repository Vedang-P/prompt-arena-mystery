import { useEffect, useRef, useState } from 'react';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function Login({ config, onDevLogin, error, busy }) {
  const [code, setCode] = useState('');
  const googleReady = !!config?.google;
  return (
    <div className="center-screen">
      <div className="login-card">
        <p className="login-kicker">Prompt Arena presents</p>
        <h1 className="login-title">
          Mystery<em>a live interrogation</em>
        </h1>
        <p className="login-sub">One case file per detective. Sign in to open yours.</p>

        {googleReady ? (
          <a className="btn brass google-login" href="/api/auth/google">
            <svg className="google-g" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </a>
        ) : (
          <p className="login-note">
            {config
              ? 'Google sign-in is not configured on this deployment yet.'
              : 'Checking sign-in options…'}
          </p>
        )}

        {config?.devLogin && (
          <form
            className="login-dev"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) onDevLogin(code.trim());
            }}
          >
            <label>
              <span className="field-label">Dev team code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="PANDA-7K2"
                spellCheck={false}
              />
            </label>
            <button className="btn ghost" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Enter with code'}
            </button>
          </form>
        )}

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}

export function DialogueOverlay({
  character,
  subtitle,
  messages,
  typing,
  onAsk,
  disabled,
  error,
  onClose,
}) {
  const [text, setText] = useState('');
  const logRef = useRef(null);
  const busyRef = useRef(false);

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

  return (
    <div className="dialogue">
      <div className="bubble-column" ref={logRef}>
        {messages.length === 0 && (
          <p className="stage-direction">— They look at you, waiting. —</p>
        )}
        {turns.map((t) =>
          t.role === 'player' ? (
            <div key={t.key} className="turn player">
              <p className="line player">{t.content}</p>
            </div>
          ) : (
            <div key={t.key} className="turn npc">
              {t.beginsTurn && <div className="speaker">{character.name}</div>}
              {t.pending ? (
                <p className="line npc typing">
                  <i />
                  <i />
                  <i />
                </p>
              ) : (
                <p className="line npc">{t.content}</p>
              )}
            </div>
          )
        )}
      </div>

      <div className="suggested-questions">{(character.questions ?? []).map((q) => <button key={q} disabled={typing} onClick={() => setText(q)}>{q}</button>)}</div>
      {error && <p className="dialogue-error">{error}</p>}

      <form className="ask-bar" onSubmit={send}>
        <div className="ask-field">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={disabled ? 'The case is closed.' : 'Ask your question…'}
            disabled={disabled}
            spellCheck={false}
          />
        </div>
        <button className="ask-submit" type="submit" disabled={typing || disabled || !text.trim()}>
          Ask
        </button>
      </form>

      <div className="name-card">
        <span className="name-card-name">{character.name}</span>
        {subtitle && <span className="name-card-role">{subtitle}</span>}
        <button className="leave-btn" onClick={onClose}>
          Leave conversation
        </button>
      </div>
    </div>
  );
}

export function Notebook({ state, onClose, onInspect }) {
  const characters = Object.fromEntries(state.characters.map((c) => [c.id, c.name]));
  const byCharacter = {};
  for (const f of state.unlocked) {
    (byCharacter[f.character] ??= []).push(f);
  }
  const clueLabels = {};
  for (const room of state.rooms) {
    for (const h of room.hotspots) {
      if (h.type === 'clue') clueLabels[h.clue] = h.label;
    }
  }
  const solvedPuzzles = state.solvedPuzzles ?? [];
  const puzzlePrompts = Object.fromEntries((state.puzzles ?? []).map((p) => [p.id, p.prompt]));
  const currentAct = (state.acts ?? []).find((a) => a.id === state.act) ?? null;
  return (
    <div className="notebook">
      <div className="notebook-head">
        <div>
          <h2 className="notebook-title">Detective's Notebook</h2>
          <p className="notebook-case">{state.title}</p>
        </div>
        {onClose && (
          <button className="notebook-close" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <section className="nb-section">
        <h3 className="nb-heading">Exhibits found · {state.discovered.length}</h3>
        {state.discovered.length === 0 ? (
          <p className="nb-empty">Nothing yet. Search the rooms.</p>
        ) : (
          <ol className="nb-exhibits">
            {state.discovered.map((id, i) => (
              <li key={id} className="nb-clue">
                <span className="nb-numeral">{ROMAN[i] ?? i + 1}</span>
                <button className="nb-evidence-button" onClick={() => onInspect?.(id)}>{state.clues?.find((c) => c.id === id)?.name ?? clueLabels[id] ?? id} ↗</button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="nb-section">
        <h3 className="nb-heading">Sleuthing</h3>
        {currentAct?.objective && <p className="nb-objective">{currentAct.objective}</p>}
        <div className="nb-stats">
          <span className="nb-stat">
            Exhibits <b>{state.discovered.length}</b>
          </span>
          <span className="nb-stat">
            Puzzles <b>{solvedPuzzles.length}</b>
          </span>
          <span className="nb-stat">
            Penalties <b>{state.penalties ?? 0}</b>
          </span>
        </div>
        {solvedPuzzles.length === 0 ? (
          <p className="nb-empty">No puzzles cracked yet. The threads are still loose.</p>
        ) : (
          <ul className="nb-puzzles">
            {solvedPuzzles.map((id) => (
              <li key={id} className="nb-puzzle">
                <span className="nb-numeral">✓</span>
                <span>{puzzlePrompts[id] ?? clueLabels[id] ?? id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nb-section">
        <h3 className="nb-heading">Testimony</h3>
        {state.unlocked.length === 0 && <p className="nb-empty">Question the suspects.</p>}
        {Object.entries(byCharacter).map(([id, facts]) => (
          <div key={id} className="nb-group">
            <h4 className="nb-char">{characters[id] ?? id}</h4>
            {facts.map((f) => (
              <p key={f.fact} className="nb-fact">
                {f.text}
              </p>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

export function AccuseModal({ state, onClose, onSubmit, result, busy }) {
  const [culprit, setCulprit] = useState(state.characters[0]?.id ?? '');
  const [method, setMethod] = useState('');
  const [motive, setMotive] = useState('');
  const clueLabels = {};
  for (const room of state.rooms) {
    for (const h of room.hotspots) {
      if (h.type === 'clue') clueLabels[h.clue] = h.label;
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="indictment"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (method.trim() && motive.trim()) onSubmit({ culprit, method, motive });
        }}
      >
        <header className="indictment-head">
          <div className="indictment-ornament">◆ ◆ ◆</div>
          <h3 className="indictment-title">The Final Accusation</h3>
          <p className="indictment-sub">Judge and jury want your conclusion, not your phrasing.</p>
        </header>

        <label className="field">
          <span className="field-label">Who did it?</span>
          <select value={culprit} onChange={(e) => setCulprit(e.target.value)}>
            {state.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">How was it done?</span>
          <textarea
            rows={3}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="Describe the method in your own words…"
          />
        </label>

        <label className="field">
          <span className="field-label">Why?</span>
          <textarea
            rows={3}
            value={motive}
            onChange={(e) => setMotive(e.target.value)}
            placeholder="Describe the motive…"
          />
        </label>

        {result && (
          <div className={`verdict ${result.correct ? 'good' : 'bad'}`}>
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

        <div className="modal-actions">
          <button type="button" className="btn on-paper" onClick={onClose}>
            Keep digging
          </button>
          <button className="btn wine" type="submit" disabled={busy}>
            {busy ? 'The chief is reading…' : 'Accuse'}
          </button>
        </div>
      </form>
    </div>
  );
}

const PUZZLE_KINDS = {
  text: { icon: '✎', label: 'Written clue' },
  code: { icon: '⌘', label: 'Passcode' },
  email: { icon: '@', label: 'Email address' },
  choice: { icon: '◆', label: 'Choose one' },
};

export function PuzzleModal({
  puzzle,
  solved,
  penalties,
  onSolve,
  onClose,
  busy,
  result,
  clueLabels = {},
}) {
  const [answer, setAnswer] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  const [last, setLast] = useState(null);

  useEffect(() => {
    setAnswer('');
    setHintOpen(false);
    setLast(null);
  }, [puzzle?.id]);

  if (!puzzle) return null;

  const kind = PUZZLE_KINDS[puzzle.kind] ?? PUZZLE_KINDS.text;
  const isChoice = puzzle.kind === 'choice';
  const settled = solved || result?.correct || result?.alreadySolved;
  const grants = (result?.grants ?? []).map((id) => clueLabels[id] ?? id);

  const submit = (value) => {
    const text = String(value ?? '').trim();
    if (!text || busy || settled) return;
    setLast(text);
    setAnswer('');
    onSolve(text);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="puzzle-card" role="dialog" aria-modal="true" aria-label="Investigation puzzle" onClick={(e) => e.stopPropagation()}>
        <header className="puzzle-head">
          <span className="puzzle-kind">{kind.icon}</span>
          <div className="puzzle-head-text">
            <p className="puzzle-kicker">{kind.label}</p>
              <h3 className="puzzle-title">{puzzle.title ?? 'A loose thread'}</h3>
          </div>
          <span className="puzzle-penalties-chip">Penalties {penalties ?? 0}</span>
        </header>

        <p className="puzzle-prompt">{puzzle.prompt}</p>{puzzle.kind === 'email' && <p className="settings-note">This is an in-game form. A fictional address is fine; no email is sent.</p>}

        {puzzle.evidence && (
          <figure className="puzzle-figure">
            <a href={puzzle.evidence} target="_blank" rel="noreferrer"><img src={puzzle.evidence} alt="Puzzle evidence · open full size" /></a>
          </figure>
        )}

        {puzzle.hint && (
          <div className="puzzle-hint">
            <button
              type="button"
              className="puzzle-hint-toggle"
              onClick={() => setHintOpen((o) => !o)}
            >
              {hintOpen ? 'Hide the hint' : 'Ask for a hint'}
            </button>
            {hintOpen && <p className="puzzle-hint-text">{puzzle.hint}</p>}
          </div>
        )}

        {settled && !result && (
          <div className="puzzle-settled">
            <p className="puzzle-solved-mark">◆ Cracked</p>
            <p className="puzzle-solved-note">
              This one's done. Whatever it gave you is in the notebook.
            </p>
          </div>
        )}

        {!settled && isChoice && (
          <div className="puzzle-options">
            {(puzzle.options ?? []).map((option) => (
              <button
                key={option}
                type="button"
                className={`puzzle-option ${
                  result && last === option ? (result.correct ? 'correct' : 'wrong') : ''
                }`}
                onClick={() => submit(option)}
                disabled={busy}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {!settled && !isChoice && (
          <form
            className="puzzle-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit(answer);
            }}
          >
            <input
              autoFocus
              type={puzzle.kind === 'email' ? 'email' : 'text'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              aria-label="Puzzle answer" placeholder={puzzle.kind === 'email' ? 'detective@example.com' : 'Type your answer…'}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
            />
            <button className="ask-submit" type="submit" disabled={busy || !answer.trim()}>
              {busy ? '…' : 'Answer'}
            </button>
          </form>
        )}

        {result?.correct && (
          <div className="puzzle-success">
            <p className="puzzle-success-message">{result.message || "That's it."}</p>
            {grants.length > 0 && (
              <div className="puzzle-grants">
                {grants.map((label) => (
                  <span key={label} className="exhibit-chip">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {result?.alreadySolved && !result.correct && (
          <div className="puzzle-success">
            <p className="puzzle-success-message">{result.message || 'Already cracked.'}</p>
          </div>
        )}

        {result && !result.correct && !result.alreadySolved && (
          <div className="puzzle-fail">
            <p className="puzzle-fail-message">
              {result.message || puzzle.fail_message || 'Not quite.'}
            </p>
            {result.penalty > 0 && (
              <p className="puzzle-penalty">
                +{result.penalty} {result.penalty === 1 ? 'notch' : 'notches'} against you
              </p>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {settled ? 'Close' : 'Step away'}
          </button>
        </div>
      </div>
    </div>
  );
}

const titleize = (id) =>
  String(id ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());

export function StoryOverlay({
  lines = [],
  kicker,
  title,
  backdrop,
  onDone,
  busy,
  doneLabel = 'Continue',
  names = {},
}) {
  const [index, setIndex] = useState(0);
  const total = lines.length;
  const line = lines[Math.min(index, Math.max(0, total - 1))];
  const last = index >= total - 1;
  const speaker = line?.speaker;
  const isNarration = speaker === 'narrator';
  const isVoice = speaker === 'voice';
  const label = names[speaker] ?? (speaker ? titleize(speaker) : '');

  const advance = () => {
    if (!last) setIndex((i) => i + 1);
  };

  return (
    <div className="story-overlay" onClick={advance} role="presentation">
      {backdrop && <div className="story-backdrop" style={{ backgroundImage: `url(${backdrop})` }} />}
      <div className="story-shade" />
      <div className="story-bar top" />
      <div className="story-bar bottom" />

      <div className="story-stage">
        {(kicker || title) && (
          <header className="story-head">
            {kicker && <p className="story-kicker">{kicker}</p>}
            {title && <h1 className="story-title">{title}</h1>}
          </header>
        )}

        {line && (
          <div className="story-line-wrap" key={index}>
            <p
              className={`story-line ${isNarration ? 'narrator' : ''} ${isVoice ? 'voice' : ''}`}
            >
              {!isNarration && label && <span className="story-speaker">{label}</span>}
              {line.text}
            </p>
          </div>
        )}

        <div className="story-controls" onClick={(e) => e.stopPropagation()}>
          <div className="story-progress">
            {lines.map((l, i) => (
              <span
                key={i}
                className={`seg ${i < index ? 'done' : ''} ${i === index ? 'active' : ''}`}
              />
            ))}
          </div>
          <div className="story-buttons">
            <button className="btn ghost" onClick={() => onDone?.()} disabled={busy}>
              Skip
            </button>
            {last ? (
              <button className="btn brass" onClick={() => onDone?.()} disabled={busy}>
                {busy ? 'Entering…' : doneLabel}
              </button>
            ) : (
              <button className="btn ghost" onClick={advance}>
                Continue
              </button>
            )}
          </div>
        </div>

        {!last && <p className="story-hint">Click to continue</p>}
      </div>
    </div>
  );
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

export function EndingCard({ ending, score, penalties, team, title, onReplay }) {
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
        {onReplay && (
          <button className="btn ghost" onClick={onReplay}>
            Replay the case
          </button>
        )}
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
      {notice.clues?.length > 0 && (
        <div className="toast-chips">
          {notice.clues.map((label) => (
            <span key={label} className="exhibit-chip">
              {label}
            </span>
          ))}
        </div>
      )}
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
