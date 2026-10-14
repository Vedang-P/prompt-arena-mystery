import { useEffect, useMemo, useRef, useState } from 'react';
import { CaseImage, useCaseDialog } from './InvestigationUI.jsx';

export default function CaseJournal({ state, onClose }) {
  const [tab, setTab] = useState('Evidence'), [location, setLocation] = useState('all'), [selected, setSelected] = useState(state.discovered.at(-1)), [expanded, setExpanded] = useState(false);
  const root = useRef(), detail = useRef();
  const [browse, setBrowse] = useState(false);
  const collapseImage = () => { setExpanded(false); requestAnimationFrame(() => root.current?.focus()); };
  useCaseDialog(root, () => expanded ? collapseImage() : onClose());
  const act = state.acts.find(a => a.id === state.act), currentIndex = state.acts.findIndex(a => a.id === state.act);
  const exhibits = useMemo(() => state.discovered.map((id, i) => {
    const clue = state.clues.find(c => c.id === id);
    const room = state.rooms.find(r => r.hotspots.some(h => h.clue === id));
    return clue ? { ...clue, number: i + 1, room: room?.name ?? 'Case discovery' } : null;
  }).filter(Boolean), [state.discovered, state.clues, state.rooms]);
  // No keyword search here on purpose: the notebook is a file to be read, not
  // a query box. The player browses the exhibits and finds the answers there.
  const filtered = exhibits.filter(c => location === 'all' || c.room === location);
  const visible = filtered.find(c => c.id === selected) ?? filtered[0];
  const selectedIndex = filtered.findIndex(c => c.id === visible?.id);
  const knownPeople = new Set(['sameer']);
  for (const [index, chapter] of state.acts.slice(0, currentIndex + 1).entries()) {
    for (const beat of chapter.beats ?? []) for (const person of beat.cast ?? []) knownPeople.add(person.character);
    for (const line of [...(chapter.intro ?? []), ...(index < currentIndex ? chapter.outro ?? [] : [])]) knownPeople.add(line.speaker);
    for (const room of state.rooms.filter(r => chapter.rooms?.includes(r.id))) for (const spot of room.hotspots) {
      if (spot.character && (!spot.act || state.acts.findIndex(a => a.id === spot.act) <= currentIndex)) knownPeople.add(spot.character);
    }
  }
  const statements = state.characters.filter(c => knownPeople.has(c.id)).map(c => ({ ...c, facts: state.unlocked.filter(f => f.character === c.id) })).filter(c => c.facts.length);
  const statementCount = statements.reduce((count, c) => count + c.facts.length, 0);
  const resolved = (state.solvedPuzzles ?? []).map(id => {
    const puzzle = state.puzzles.find(p => p.id === id);
    const spot = state.rooms.flatMap(r => r.hotspots).find(h => h.puzzle === id);
    return { id, title: spot?.label ?? 'Investigation resolved', summary: puzzle?.solvedHint };
  });
  useEffect(() => { detail.current?.scrollTo({ top: 0 }); }, [visible?.id, tab]);
  const choose = id => { setSelected(id); setBrowse(false); };
  return <div className="case-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="case-panel journal-workspace" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Case notebook">
      {expanded && visible?.page ? <CaseImage src={visible.page} title={visible.name} expanded onCollapse={collapseImage} /> : <>
        <header className="case-panel-head"><div><p className="case-eyebrow">Prompt Arena / {state.team}</p><h2>Case notebook</h2><p className="case-header-note">Your evidence, connected. Every discovery is saved automatically.</p></div><button className="case-close" onClick={onClose} aria-label="Close notebook">×</button></header>
        <div className="journal-objective"><span className="case-eyebrow">{act?.kicker} · {act?.title}</span><p>{act?.objective || 'Follow the opening story to begin your investigation.'}</p></div>
        <nav className="case-tabs" aria-label="Notebook sections">{[['Evidence', exhibits.length], ['Statements', statementCount], ['Investigation', resolved.length]].map(([name, count]) => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}<span>{count}</span></button>)}</nav>
        {tab === 'Evidence' && <div className="journal-mobile-browse"><button className="case-button" aria-expanded={browse} onClick={() => setBrowse(v => !v)}>{browse ? '← Read selected exhibit' : `Browse ${exhibits.length} exhibits →`}</button></div>}
        {tab === 'Evidence' && <div className="journal-evidence-layout" data-browse={browse}>
          <aside className="journal-index"><div className="journal-filter"><label htmlFor="journal-location">Evidence by location</label><select id="journal-location" value={location} onChange={e => setLocation(e.target.value)}><option value="all">All locations</option>{[...new Set(exhibits.map(c => c.room))].map(room => <option key={room}>{room}</option>)}</select><p className="case-muted">{filtered.length} of {exhibits.length} {exhibits.length === 1 ? 'exhibit' : 'exhibits'}</p></div>
            <div className="journal-evidence-list">{filtered.map(c => <button key={c.id} onClick={() => choose(c.id)} aria-pressed={visible?.id === c.id}><span className="journal-number">{String(c.number).padStart(2, '0')}</span><span><strong>{c.name}</strong><small>{c.room}</small></span><span aria-hidden="true">→</span></button>)}{!filtered.length && <div className="case-empty"><h3>{exhibits.length ? 'No evidence at this location' : 'Your first discovery starts here'}</h3><p>{exhibits.length ? 'Pick another location from the filter above.' : 'Inspect objects in the room. The evidence you find will be added to this notebook.'}</p>{exhibits.length > 0 && <button className="case-button" onClick={() => setLocation('all')}>Show all locations</button>}</div>}</div>
          </aside>
          <article className="journal-reading" ref={detail} aria-live="polite">{visible ? <><div className="case-section-label"><span>Exhibit {String(visible.number).padStart(2, '0')}</span><span>Saved to case</span></div><h3>{visible.name}</h3><p className="journal-location">{visible.room}</p><p className="journal-description">{visible.description}</p>{visible.page && <CaseImage src={visible.page} title={visible.name} onExpand={() => setExpanded(true)} />}<nav className="journal-page-nav" aria-label="Browse evidence"><button className="case-button" disabled={selectedIndex <= 0} onClick={() => choose(filtered[selectedIndex - 1].id)}>← Previous</button><span>{selectedIndex + 1} / {filtered.length}</span><button className="case-button" disabled={selectedIndex >= filtered.length - 1} onClick={() => choose(filtered[selectedIndex + 1].id)}>Next →</button></nav></> : <div className="case-empty journal-empty-reading"><span className="journal-empty-mark" aria-hidden="true">◇</span><h3>{exhibits.length ? 'Adjust your filters' : 'A case worth keeping'}</h3><p>{exhibits.length ? 'Matching exhibits will appear here.' : 'Photographs, documents and discoveries stay together here as your investigation unfolds.'}</p></div>}</article>
        </div>}
        {tab === 'Statements' && <div className="journal-section-scroll" ref={detail}><div className="case-section-label"><span>What the evidence has revealed</span><span>{statements.length} people</span></div>{statements.map(c => <article key={c.id} className="journal-statement"><header><span className="statement-initial" aria-hidden="true">{c.name.charAt(0)}</span><div><h3>{c.name}</h3><small>{c.facts.length} {c.facts.length === 1 ? 'known detail' : 'known details'}</small></div></header><ul>{c.facts.map(f => <li key={f.fact}>{f.text}</li>)}</ul></article>)}{!statements.length && <div className="case-empty"><h3>No statements recorded yet</h3><p>Collect evidence and speak to people in the scene to learn more about the case.</p></div>}</div>}
        {tab === 'Investigation' && <div className="journal-section-scroll investigation-summary" ref={detail}><div className="journal-stats">{[['Evidence saved', exhibits.length], ['Leads resolved', resolved.length], ['Case penalties', state.penalties ?? 0]].map(([name, count]) => <div key={name}><strong>{count}</strong><span>{name}</span></div>)}</div><section><h3>Your path so far</h3><ol className="journal-act-list">{state.acts.slice(0, currentIndex + 1).filter(a => a.id !== 'act0').map(a => <li key={a.id}><span>{a.id === state.act ? '◉' : '✓'}</span><div><strong>{a.kicker} · {a.title}</strong><small>{a.id === state.act ? 'Current investigation' : 'Completed'}</small></div></li>)}</ol></section><section><h3>Resolved leads</h3>{resolved.length ? <ul className="journal-resolved">{resolved.map(p => <li key={p.id}><span aria-hidden="true">✓</span><div><strong>{p.title}</strong>{p.summary && <p>{p.summary}</p>}</div></li>)}</ul> : <p className="case-muted">Resolve a clue in the room to start building your trail.</p>}</section></div>}
        <footer className="case-panel-foot"><p>Case saved automatically · <span>Esc to close</span></p><button className="case-button" onClick={onClose}>Back to investigation →</button></footer>
      </>}
    </section>
  </div>;
}
