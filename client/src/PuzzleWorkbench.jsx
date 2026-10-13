import { useEffect, useRef, useState } from 'react';
import { CaseImage, useCaseDialog } from './InvestigationUI.jsx';

const TYPES = { text: 'Written clue', code: 'Access code', email: 'In-game email', choice: 'Decision' };
export default function PuzzleWorkbench({ puzzle, team, solved, penalties = 0, onSolve, onClose, busy, result, clueLabels = {}, relatedClues = [] }) {
  const [answer, setAnswer] = useState(''), [expanded, setExpanded] = useState(false), [last, setLast] = useState(null);
  const root = useRef(), imageButton = useRef();
  const draftKey = `arena-answer:${team}:${puzzle?.id}`;
  const settled = solved || result?.correct || result?.alreadySolved;
  useCaseDialog(root, () => expanded ? collapse() : onClose());
  useEffect(() => {
    try { setAnswer(sessionStorage.getItem(draftKey) ?? ''); } catch { setAnswer(''); }
    setExpanded(false); setLast(null);
  }, [draftKey]);
  useEffect(() => { if (settled) { try { sessionStorage.removeItem(draftKey); } catch {} } }, [settled, draftKey]);
  if (!puzzle) return null;
  const change = value => { setAnswer(value); try { sessionStorage.setItem(draftKey, value); } catch {} };
  const submit = e => { e.preventDefault(); if (!busy && !settled && answer.trim()) { setLast(answer); onSolve(answer.trim()); } };
  const wrong = result && !result.correct && !result.alreadySolved;
  // A rejected answer must never read like a solved one: without an authored
  // fail message, say plainly that the answer did not hold.
  const feedbackMessage = result?.message
    || (wrong
      ? 'Not quite. Re-read the evidence and try a different answer.'
      : puzzle.solvedHint || 'This clue is resolved. Your discoveries are saved in the notebook.');
  const grants = (result?.grants ?? []).map(id => clueLabels[id] ?? id);
  const collapse = () => { setExpanded(false); requestAnimationFrame(() => imageButton.current?.focus()); };
  return <div className="case-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={`case-panel puzzle-workbench ${puzzle.evidence ? 'has-art' : ''}`} ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={puzzle.title ?? 'Examine the clue'}>
      {expanded ? <CaseImage src={puzzle.evidence} title="Clue photograph" expanded onCollapse={collapse} /> : <>
        <header className="case-panel-head"><div><p className="case-eyebrow">Prompt Arena / {TYPES[puzzle.kind] ?? 'Investigation'}</p><h2 id="puzzle-heading">{puzzle.title ?? 'Examine the clue'}</h2></div><button className="case-close" aria-label="Close puzzle" onClick={onClose}>×</button></header>
        <div className="workbench-content">
          {puzzle.evidence && <section className="workbench-evidence"><div className="case-section-label"><span>01 / Examine</span><span>Original evidence</span></div><figure className="case-image"><button ref={imageButton} onClick={() => setExpanded(true)} aria-label="Enlarge clue photograph"><img src={puzzle.evidence} alt="Clue photograph" /><span>Inspect full size ↗</span></button></figure><p className="case-muted">Use the photograph to work through the clue. Your answer stays here while you inspect it.</p></section>}
          <section className="workbench-answer"><div className="case-section-label"><span>{puzzle.evidence ? '02 / Investigate' : 'Your next lead'}</span><span>{settled ? 'Recorded' : 'In progress'}</span></div><p className="case-prompt">{puzzle.prompt}</p>
            {puzzle.kind === 'email' && <p className="case-muted">Use a fictional address. This form belongs to the story and sends no email.</p>}
            {wrong && relatedClues.map(clue => <details className="case-reference" key={clue.id}><summary>From your notebook · {clue.name}</summary><p>{clue.description}</p></details>)}
            <div className={`case-feedback ${wrong ? 'retry' : 'complete'}`} role="status" aria-live="polite">
              {(result || settled) && <><p className="case-eyebrow">{wrong ? (settled ? '✕ Outcome recorded' : '✕ Try another approach') : (result?.alreadySolved ? '✓ Already resolved' : '✓ Correct')}</p><p>{feedbackMessage}</p>{result?.penalty > 0 && <small>+{result.penalty} penalty — a wrong answer costs 1, up to {result.penaltyCap ?? 3} per clue.</small>}{result?.penalty === 0 && result?.penaltyCap !== undefined && wrong && <small>No further penalty — this clue has reached its cap of {result.penaltyCap}.</small>}{grants.length > 0 && <div className="case-grants"><span>Added to notebook</span>{grants.map(label => <strong key={label}>{label}</strong>)}</div>}</>}
            </div>
            {!settled && <form id="case-puzzle-answer" className="case-answer-form" onSubmit={submit} aria-busy={busy}>
              {puzzle.kind === 'choice' ? <fieldset aria-invalid={!!wrong && answer === last}><legend>Choose your response</legend>{(puzzle.options ?? []).map((option, index) => <label key={option} className={`case-choice ${answer === option ? 'selected' : ''}`}><input type="radio" name="puzzle-choice" value={option} checked={answer === option} onChange={() => change(option)} disabled={busy} /><span className="choice-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></label>)}</fieldset> : <label className="case-answer-label" htmlFor="case-answer">{puzzle.kind === 'code' ? 'Access code' : puzzle.kind === 'email' ? 'Email address' : 'Your answer'}<input id="case-answer" type={puzzle.kind === 'email' ? 'email' : 'text'} value={answer} onChange={e => change(e.target.value)} placeholder={puzzle.kind === 'email' ? 'you@example.com' : puzzle.kind === 'code' ? 'Enter the code' : 'Write your answer'} autoComplete="off" spellCheck={false} disabled={busy} aria-invalid={!!wrong && answer === last} /></label>}
            </form>}
          </section>
        </div>
        <footer className="case-panel-foot"><p>{settled ? 'Discoveries saved to your notebook' : <>Case penalties <b>{penalties}</b></>}</p><div className="case-footer-actions"><button className={`case-button ${settled ? 'primary' : ''}`} onClick={onClose}>{settled ? 'Return to investigation →' : 'Back to room'}</button>{!settled && <button className="case-button primary" form="case-puzzle-answer" disabled={busy || !answer.trim()} type="submit">{busy ? 'Checking…' : puzzle.kind === 'choice' ? 'Confirm choice →' : 'Check answer →'}</button>}</div></footer>
      </>}
    </section>
  </div>;
}
