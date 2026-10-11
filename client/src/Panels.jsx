import { useEffect, useRef, useState } from 'react';
import CaseJournal from './CaseJournal.jsx';
import PuzzleWorkbench from './PuzzleWorkbench.jsx';
import LogoutButton from './LogoutButton.jsx';
import { useSettings } from './Settings.jsx';
import { useCaseDialog } from './InvestigationUI.jsx';
import { speakCharacter,stopCharacterSpeech } from './CharacterSpeech.js';


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
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const { narration } = useSettings();
  const initialCount = useRef(messages.length);
  const spoken = useRef('');
  const heardTurn = useRef(false);
  const recognition = useRef(null);
  const [listening,setListening] = useState(false);
  const [speechError,setSpeechError] = useState(null);
  const Recognition=window.SpeechRecognition??window.webkitSpeechRecognition;
  useCaseDialog(panelRef, onClose);
  useEffect(()=>{inputRef.current?.focus({preventScroll:true});},[]);
  useEffect(()=>{
    if(typing){heardTurn.current=true;stopCharacterSpeech();return;}
    if(!heardTurn.current||!narration||messages.length<=initialCount.current)return;
    const last=messages.at(-1);const key=`${messages.length}:${last?.content}`;
    if(last?.role!=='npc'||!last.content||spoken.current===key)return;
    spoken.current=key;
    setSpeechError(null);
    return speakCharacter(character.id,last.content,setSpeechError);
  },[messages,typing,narration,character.id]);
  useEffect(()=>()=>{recognition.current?.abort();stopCharacterSpeech();},[]);
  const dictate=()=>{
    if(listening){recognition.current?.stop();return;}
    if(!Recognition)return;
    stopCharacterSpeech();
    const r=new Recognition();recognition.current=r;r.lang='en-IN';r.interimResults=false;r.continuous=false;
    r.onstart=()=>{setListening(true);setSpeechError(null);};r.onend=()=>setListening(false);
    r.onresult=e=>setText(e.results?.[0]?.[0]?.transcript ?? '');
    r.onerror=e=>{setListening(false);setSpeechError(e.error==='not-allowed'?'Microphone permission is off. You can type your question.':'Speech could not be heard. Try again or type your question.');};
    try{r.start();}catch{setListening(false);}
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
  const lastReply = !typing && messages.at(-1)?.role === 'npc' && messages.at(-1)?.content ? messages.at(-1).content : null;
  const questions = [...new Set(character.questions ?? [])];

  return (
    <div className="case-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="case-panel interview-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Interview with ${character.name}`}>
        <header className="case-panel-head">
          <div>
            <p className="case-eyebrow">Prompt Arena / Interview</p>
            <h2>{character.name}</h2>
            {subtitle && <p className="case-header-note">{subtitle}</p>}
          </div>
          <button className="case-close" onClick={onClose} aria-label="Leave conversation">×</button>
        </header>

        <div className="interview-transcript" ref={logRef}>
          {turns.length === 0 && (
            <p className="interview-empty">They look at you, waiting.</p>
          )}
          {turns.map((t) =>
            t.role === 'player' ? (
              <div key={t.key} className="interview-turn player">
                <p className="interview-text">{t.content}</p>
              </div>
            ) : (
              <div key={t.key} className="interview-turn npc">
                {t.beginsTurn && <span className="interview-speaker">{character.name}</span>}
                {t.pending ? (
                  <p className="interview-typing"><i /><i /><i /></p>
                ) : (
                  <p className="interview-text">{t.content}</p>
                )}
              </div>
            )
          )}
        </div>

        {questions.length > 0 && (
          <div className="interview-prompts">
            <span className="case-section-label">Suggested questions</span>
            <div className="interview-chips">
              {questions.map((q, i) => <button key={`${i}-${q}`} type="button" className="case-chip" disabled={typing} onClick={() => { setText(q); inputRef.current?.focus(); }}>{q}</button>)}
            </div>
          </div>
        )}

        {(error || speechError) && <p className="case-note error" role="alert">{error || speechError}</p>}

        <footer className="case-panel-foot interview-foot">
          <div className="interview-utilities">
            {lastReply && <button type="button" className="case-text-button" onClick={() => { setSpeechError(null); speakCharacter(character.id, lastReply, setSpeechError); }}>Replay reply ↺</button>}
            {Recognition && <button type="button" className="case-text-button" disabled={typing || disabled} onClick={dictate}>{listening ? 'Stop mic' : 'Speak'}</button>}
          </div>
          <form className="interview-ask" onSubmit={send}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={disabled ? 'The case is closed.' : 'Ask your question…'}
              disabled={disabled}
              spellCheck={false}
            />
            <button className="case-button primary" type="submit" disabled={typing || disabled || !text.trim()}>
              {typing ? 'Listening…' : 'Ask →'}
            </button>
          </form>
        </footer>
      </section>
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
