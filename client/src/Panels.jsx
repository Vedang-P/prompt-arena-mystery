import { useEffect, useRef, useState } from 'react';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function Login({ onLogin, error, busy }) {
  const [code, setCode] = useState('');
  return (
    <div className="center-screen">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onLogin(code.trim());
        }}
      >
        <p className="login-kicker">Prompt Arena presents</p>
        <h1 className="login-title">
          Mystery<em>a live interrogation</em>
        </h1>
        <p className="login-sub">Three suspects, one culprit, and every question you dare to ask.</p>
        <label>
          <span className="field-label">Team code</span>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="·······"
            spellCheck={false}
          />
        </label>
        <button className="btn brass" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Enter the case'}
        </button>
        {error && <p className="login-error">{error}</p>}
        <p className="login-hint">demo code: PANDA-7K2</p>
      </form>
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

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, typing]);

  const send = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || typing || disabled) return;
    setText('');
    onAsk(value);
  };

  return (
    <div className="dialogue">
      <div className="bubble-column" ref={logRef}>
        {messages.length === 0 && (
          <p className="stage-direction">— They look at you, waiting. —</p>
        )}
        {messages.map((m, i) => {
          if (m.role === 'player') {
            return (
              <div key={i} className="turn player">
                <p className="line player">{m.content}</p>
              </div>
            );
          }
          const streaming = typing && i === messages.length - 1 && !m.content;
          const beginsTurn = i === 0 || messages[i - 1].role === 'player';
          return (
            <div key={i} className="turn npc">
              {beginsTurn && <div className="speaker">{character.name}</div>}
              {streaming ? (
                <p className="line npc typing">
                  <i />
                  <i />
                  <i />
                </p>
              ) : (
                <p className="line npc">{m.content}</p>
              )}
            </div>
          );
        })}
      </div>

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

export function Notebook({ state, onClose }) {
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
                <span>{clueLabels[id] ?? id}</span>
              </li>
            ))}
          </ol>
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

export function Notice({ notice, onClose }) {
  return (
    <div className="toast" onClick={onClose}>
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
