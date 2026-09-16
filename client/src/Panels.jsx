import { useEffect, useRef, useState } from 'react';

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
        <h1>Prompt Arena: Mystery</h1>
        <p className="sub">Enter your team code, detective.</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="TEAM CODE"
          spellCheck={false}
        />
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Enter the case'}
        </button>
        {error && <p className="error">{error}</p>}
        <p className="hint">demo code: PANDA-7K2</p>
      </form>
    </div>
  );
}

export function DialogueOverlay({ character, messages, typing, onAsk, disabled, error, onClose }) {
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
          <div className="bubble">
            <div className="bubble-text muted">They look at you, waiting.</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'player' ? 'player' : ''}`}>
            {m.role !== 'player' && (
              <img className="avatar" src={`/assets/portraits/${character.id}.png`} alt="" />
            )}
            <div className="bubble-text">
              {m.content || (typing && i === messages.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="dialogue-error">{error}</p>}

      <form className="ask-bar" onSubmit={send}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ? 'The case is closed.' : 'Type here or speak into your microphone...'}
          disabled={disabled}
          spellCheck={false}
        />
        <button className="ask-ok" type="submit" disabled={typing || disabled || !text.trim()}>
          OK
        </button>
      </form>

      <div className="name-card">
        <span className="name-card-name">{character.name}</span>
        <button className="leave-btn" onClick={onClose}>
          leave conversation
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
        <strong>Detective's notebook</strong>
        {onClose && (
          <button className="btn ghost small" onClick={onClose}>
            close
          </button>
        )}
      </div>
      <section>
        <h4>Evidence found ({state.discovered.length})</h4>
        {state.discovered.length === 0 && <p className="nb-empty">Nothing yet. Search the rooms.</p>}
        <ul>
          {state.discovered.map((id) => (
            <li key={id} className="nb-clue">
              {clueLabels[id] ?? id}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>What you know</h4>
        {state.unlocked.length === 0 && <p className="nb-empty">Question the suspects.</p>}
        {Object.entries(byCharacter).map(([id, facts]) => (
          <div key={id} className="nb-group">
            <h5>{characters[id] ?? id}</h5>
            <ul>
              {facts.map((f) => (
                <li key={f.fact} className="nb-fact">
                  {f.text}
                </li>
              ))}
            </ul>
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
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (method.trim() && motive.trim()) onSubmit({ culprit, method, motive });
        }}
      >
        <h3>Final accusation</h3>
        <p className="sub">Judge and jury want your conclusion, not your phrasing.</p>

        <label className="field">
          <span>Who did it?</span>
          <select value={culprit} onChange={(e) => setCulprit(e.target.value)}>
            {state.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>How was it done?</span>
          <textarea
            rows={3}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="Describe the method in your own words…"
          />
        </label>

        <label className="field">
          <span>Why?</span>
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
          <button type="button" className="btn ghost" onClick={onClose}>
            Keep digging
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
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
      <strong>{notice.title}</strong>
      {notice.body && <p>{notice.body}</p>}
      {notice.facts?.length > 0 && (
        <ul>
          {notice.facts.map((f) => (
            <li key={f.fact}>{f.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
