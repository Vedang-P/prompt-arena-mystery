import { useEffect, useMemo, useState } from 'react';
import './dev.css';
import { devAct, devBulk, devCatalog, devPenalties, devReset, devRoom, devToggle } from './api.js';

const TABS = [['acts', 'Acts'], ['rooms', 'Rooms'], ['clues', 'Clues'], ['puzzles', 'Puzzles'], ['tools', 'Tools']];

// The developer sandbox panel. Rendered only for a dev session (DEV_TEAM_CODE):
// jump to any act or room, toggle every clue and puzzle (answer keys included),
// reset the sandbox, and replay the act cinematics on demand. Every switch is
// applied server-side, so the save the panel edits is the save the game reads.
export default function DevPanel({ state, roomId, reveal, onReveal, onJumpRoom, onReload, onPlayIntro, onPlayOutro }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('acts');
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [penaltyDraft, setPenaltyDraft] = useState(String(state?.penalties ?? 0));

  useEffect(() => {
    if (open && !catalog) devCatalog().then(setCatalog).catch((e) => setNote(e.message ?? 'catalog failed'));
  }, [open, catalog]);
  useEffect(() => { setPenaltyDraft(String(state?.penalties ?? 0)); }, [state?.penalties]);

  const discovered = useMemo(() => new Set(state?.discovered ?? []), [state?.discovered]);
  const solved = useMemo(() => new Set(state?.solvedPuzzles ?? []), [state?.solvedPuzzles]);
  const needle = filter.trim().toLowerCase();
  const match = (text) => !needle || String(text).toLowerCase().includes(needle);

  const run = async (key, action) => {
    setBusy(key);
    setNote('');
    try { await action(); } catch (e) { setNote(e?.message ?? 'failed'); } finally { setBusy(''); }
  };
  const jumpAct = (id) => run(`act:${id}`, async () => { await devAct(id); setNote(`act → ${id}`); await onReload(); });
  const jumpRoom = (id) => run(`room:${id}`, async () => { await devRoom(id); onJumpRoom(id); setNote(`room → ${id}`); });
  const toggle = (kind, id, on) => run(`${kind}:${id}`, async () => { await devToggle(kind, id, on); await onReload(); });
  const bulk = (mode) => run(`bulk:${mode}`, async () => { await devBulk(mode); setNote(mode === 'all' ? 'everything revealed' : 'everything cleared'); await onReload(); });
  const reset = () => run('reset', async () => { await devReset(); setNote('sandbox reset'); await onReload(); });
  const setPenalties = () => run('penalties', async () => { await devPenalties(Number(penaltyDraft) || 0); setNote(`penalties → ${Number(penaltyDraft) || 0}`); await onReload(); });

  const roomName = catalog?.rooms.find((r) => r.id === roomId)?.name ?? roomId ?? '—';
  const actLabel = catalog?.acts.find((a) => a.id === state?.act)?.title ?? state?.act ?? '—';

  if (!open) {
    return <button className="dev-toggle" onClick={() => setOpen(true)} title="Developer sandbox">
      DEV · {state?.act ?? '—'} · {roomName}
    </button>;
  }

  return <aside className="dev-panel" aria-label="Developer sandbox">
    <header className="dev-head">
      <div>
        <p className="dev-kicker">Developer sandbox</p>
        <h2>{state?.team ?? 'Dev'} <small>{actLabel} · {roomName}</small></h2>
      </div>
      <button className="dev-close" onClick={() => setOpen(false)} aria-label="Close developer panel">×</button>
    </header>
    <nav className="dev-tabs">
      {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    <div className="dev-body">
      {tab === 'acts' && <div className="dev-act-grid">
        {(catalog?.acts ?? []).map((a) => <button key={a.id} className={state?.act === a.id ? 'active' : ''} disabled={!!busy} onClick={() => jumpAct(a.id)}>
          <strong>{a.kicker}</strong><span>{a.title}</span><small>{a.type}{a.entry_room ? ` · ${a.entry_room}` : ''}</small>
        </button>)}
        {!catalog && <p className="dev-note">Loading…</p>}
      </div>}

      {tab === 'rooms' && <div className="dev-list">
        <div className="dev-actions"><button disabled={!!busy} onClick={() => jumpRoom(state?.act === 'act0' ? 'gazebo' : (catalog?.acts.find((a) => a.id === state?.act)?.entry_room ?? 'gazebo'))}>Act entry room</button><button disabled={!!busy} onClick={() => jumpRoom('sameer_room')}>Sameer’s room</button></div>
        {(catalog?.rooms ?? []).filter((r) => match(`${r.id} ${r.name}`)).map((r) => <button key={r.id} className={`dev-row ${roomId === r.id ? 'active' : ''}`} disabled={!!busy} onClick={() => jumpRoom(r.id)}>
          <span className="dev-check">{roomId === r.id ? '◉' : '↗'}</span>
          <span className="dev-row-text"><strong>{r.name}</strong><small>{r.id}</small></span>
        </button>)}
        {!catalog && <p className="dev-note">Loading…</p>}
      </div>}

      {(tab === 'clues' || tab === 'puzzles') && <div className="dev-list">
        <div className="dev-actions">
          <button disabled={!!busy} onClick={() => bulk('all')}>Reveal everything</button>
          <button disabled={!!busy} onClick={() => bulk('none')}>Clear everything</button>
        </div>
        {(catalog?.[tab] ?? []).filter((x) => match(`${x.id} ${x.name ?? ''} ${(x.answers ?? []).join(' ')}`)).map((x) => {
          const on = tab === 'clues' ? discovered.has(x.id) : solved.has(x.id);
          return <button key={x.id} className={`dev-row ${on ? 'on' : ''}`} disabled={!!busy} onClick={() => toggle(tab === 'clues' ? 'clue' : 'puzzle', x.id, !on)}>
            <span className="dev-check">{on ? '✓' : '○'}</span>
            <span className="dev-row-text"><strong>{x.name ?? x.id}</strong><small>{x.id}{x.kind ? ` · ${x.kind}` : ''}</small>{x.answers?.length ? <em>{x.answers.join(' / ')}</em> : null}</span>
          </button>;
        })}
        {!catalog && <p className="dev-note">Loading…</p>}
      </div>}

      {tab === 'tools' && <div className="dev-list">
        <div className="dev-actions">
          <button disabled={!!busy} onClick={onPlayIntro}>Replay act intro</button>
          <button disabled={!!busy} onClick={onPlayOutro}>Play act outro</button>
        </div>
        <label className="dev-check-row">
          <input type="checkbox" checked={!!reveal} onChange={(e) => onReveal?.(e.target.checked)} />
          <span>Reveal every marker (all acts, all requirements)</span>
        </label>
        <div className="dev-actions">
          <input type="number" min="0" max="9999" value={penaltyDraft} onChange={(e) => setPenaltyDraft(e.target.value)} aria-label="Penalties" />
          <button disabled={!!busy} onClick={setPenalties}>Set penalties</button>
        </div>
        <div className="dev-actions">
          <button disabled={!!busy} className="danger" onClick={reset}>Reset sandbox (act 0, clean)</button>
        </div>
        <details className="dev-state">
          <summary>Raw state</summary>
          <pre>{JSON.stringify({ act: state?.act, room: roomId, discovered: state?.discovered?.length, solved: state?.solvedPuzzles?.length, penalties: state?.penalties, devRoom: state?.devRoom }, null, 1)}</pre>
        </details>
        <p className="dev-note">Shortcuts: <kbd>W A S D</kbd> move · <kbd>Space</kbd> pause cinematics · by default markers follow the current act exactly as a player sees them; tick Reveal every marker to show the whole room.</p>
      </div>}
    </div>
    <footer className="dev-foot">
      <input type="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {note && <p className="dev-note" role="status">{busy ? '…' : note}</p>}
    </footer>
  </aside>;
}
