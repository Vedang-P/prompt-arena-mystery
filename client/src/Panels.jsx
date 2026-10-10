import { useEffect, useRef, useState } from 'react';
import CaseJournal from './CaseJournal.jsx';
import PuzzleWorkbench from './PuzzleWorkbench.jsx';
import { useSettings } from './Settings.jsx';
import { speakCharacter } from './CharacterSpeech.js';


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
  const { narration } = useSettings();
  const initialCount = useRef(messages.length);
  const spoken = useRef('');
  const heardTurn = useRef(false);
  const recognition = useRef(null);
  const [listening,setListening] = useState(false);
  const [speechError,setSpeechError] = useState(null);
  const Recognition=window.SpeechRecognition??window.webkitSpeechRecognition;
  useEffect(()=>{
    if(typing){heardTurn.current=true;return;}
    if(!heardTurn.current||!narration||messages.length<=initialCount.current)return;
    const last=messages.at(-1);const key=`${messages.length}:${last?.content}`;
    if(last?.role!=='npc'||!last.content||spoken.current===key)return;
    spoken.current=key;
    return speakCharacter(character.id,last.content);
  },[messages,typing,narration,character.id]);
  useEffect(()=>()=>{recognition.current?.abort();window.speechSynthesis?.cancel();},[]);
  const dictate=()=>{
    if(listening){recognition.current?.stop();return;}
    if(!Recognition)return;
    window.speechSynthesis?.cancel();
    const r=new Recognition();recognition.current=r;r.lang='en-IN';r.interimResults=false;r.continuous=false;
    r.onstart=()=>{setListening(true);setSpeechError(null);};r.onend=()=>setListening(false);
    r.onresult=e=>setText(e.results[0][0].transcript);
    r.onerror=e=>{setListening(false);setSpeechError(e.error==='not-allowed'?'Microphone permission is off. You can type your question.':'Speech could not be heard. Try again or type your question.');};
    r.start();
  };

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
      {speechError && <p className="dialogue-error">{speechError}</p>}

      <form className="ask-bar" onSubmit={send}>
        {Recognition && <button type="button" className="dictate-button" disabled={typing||disabled} onClick={dictate}>{listening?'Stop mic':'Speak'}</button>}
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
  return <CaseJournal state={state} onClose={onClose} onInspect={onInspect} />;
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

export function PuzzleModal(props) {
  return <PuzzleWorkbench {...props} />;
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
