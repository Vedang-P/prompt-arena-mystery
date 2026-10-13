import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const POLL_MS = 4000;

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || res.statusText);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
};

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
const fmtAgo = (iso, now) => {
  if (!iso) return 'never';
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return fmtDateTime(iso);
};
const fmtDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(sec).padStart(2, '0')}s`;
};

const KIND_LABEL = { team: 'Event team', guest: 'Guest', practice: 'Practice', google: 'Google' };

const EVENT_LABELS = {
  login: 'Signed in',
  act_complete: 'Act completed',
  clue_found: 'Evidence found',
  puzzle_solve: 'Puzzle attempt',
  restart: 'Run restarted',
  exit: 'Left fullscreen',
  exit_return: 'Returned in time',
  exit_strike: 'Late return — strike',
  disqualified: 'Disqualified',
  requalified: 'Requalified',
  admin_penalties: 'Penalties adjusted',
  admin_stage: 'Stage moved',
  admin_reset: 'Run reset',
  admin_strikes: 'Strikes set',
  exempted: 'Enforcement exemption added',
  unexempted: 'Enforcement exemption removed',
  fullscreen_unsupported: 'Fullscreen unsupported here',
  ending: 'Ending reached',
};

const eventDetailText = (ev) => {
  const d = ev.detail ?? {};
  switch (ev.type) {
    case 'act_complete':
      return d.endcard || d.next ? `→ ${d.next ?? d.act}` : '';
    case 'clue_found':
      return d.name ?? d.clue ?? '';
    case 'puzzle_solve':
      return `${d.puzzle ?? ''}${d.correct ? ' · correct' : ''}${d.penalty ? ` · +${d.penalty} penalties` : ''}${d.alreadySolved ? ' · repeat' : ''}`;
    case 'exit':
      return `${d.kind ?? 'fullscreen'} · grace ${Math.round((d.graceMs ?? 10000) / 1000)}s`;
    case 'exit_return':
      return `back in ${(Math.max(0, d.elapsedMs ?? 0) / 1000).toFixed(1)}s`;
    case 'exit_strike':
      return `away ${(Math.max(0, d.elapsedMs ?? 0) / 1000).toFixed(0)}s · strike ${d.strikes}/3`;
    case 'disqualified':
      return d.reason ?? '';
    case 'admin_penalties':
      return `${d.delta >= 0 ? '+' : ''}${d.delta} → ${d.penalties}`;
    case 'admin_stage':
      return `→ ${d.act}`;
    case 'admin_strikes':
      return `${d.from} → ${d.to}`;
    case 'restart':
      return `+${d.penalty} penalties`;
    default:
      return '';
  }
};

export default function AdminApp() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    let alive = true;
    api('/api/admin/session')
      .then((s) => alive && setSession(s))
      .catch(() => alive && setSession(null));
    return () => {
      alive = false;
    };
  }, []);
  if (session === undefined) return <div className="admin-loading">Opening the control room…</div>;
  if (!session) return <AdminLogin onSignedIn={setSession} />;
  return <Dashboard session={session} onLoggedOut={() => setSession(null)} />;
}

function AdminLogin({ onSignedIn }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/admin/login', { username, password });
      onSignedIn(await api('/api/admin/session'));
    } catch (err) {
      setError(
        err.data?.detail ??
          (err.status === 429
            ? 'Too many attempts — wait five minutes before trying again.'
            : err.status === 503
              ? 'No ADMIN_PASSWORD is configured on this deployment.'
              : 'Wrong username or password.')
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={submit}>
        <p className="admin-eyebrow">Prompt Arena · Event Control</p>
        <h1>Control Room</h1>
        <p className="admin-login-note">
          Team progress, disqualifications and enforcement live here. Invigilators only.
        </p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        </label>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="admin-button primary" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Enter the control room'}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ session, onLoggedOut }) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState('teams');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('progress');
  const [selected, setSelected] = useState(null);
  const [audit, setAudit] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api('/api/admin/overview');
      setData(next);
      setConnected(true);
    } catch (err) {
      if (err.status === 401) onLoggedOut();
      else setConnected(false);
    }
  }, [onLoggedOut]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (tab !== 'audit') return;
    let alive = true;
    api('/api/admin/audit').then((d) => alive && setAudit(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [tab, data?.serverTime]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const runAction = async (teamId, action, payload, confirmText, successText) => {
    if (confirmText && !window.confirm(confirmText)) return null;
    setBusyAction(`${teamId}:${action}`);
    try {
      const result = await post(`/api/admin/teams/${teamId}/${action}`, payload);
      setToast({ kind: 'ok', text: successText ?? 'Done.' });
      await refresh();
      setRefreshTick((n) => n + 1);
      return result;
    } catch (err) {
      setToast({ kind: 'error', text: err.data?.error ? `Action failed: ${err.data.error}` : 'Action failed.' });
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  const teams = data?.teams ?? [];
  const stats = data?.stats;
  const config = data?.config;
  const disqualified = teams.filter((t) => t.disqualified);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = teams.filter((t) => !q || t.name.toLowerCase().includes(q));
    list = list.filter((t) => {
      switch (filter) {
        case 'playing': return t.actNumber > 0 && !t.solved && !t.disqualified;
        case 'notstarted': return t.actNumber === 0 && !t.solved && !t.disqualified;
        case 'solved': return t.solved;
        case 'warned': return t.strikes > 0 && !t.disqualified;
        case 'dq': return t.disqualified;
        case 'exempt': return t.exempt;
        case 'extras': return t.kind !== 'team';
        default: return true;
      }
    });
    const progress = (t) => t.discovered + t.solvedPuzzles;
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'penalties': return b.penalties - a.penalties || a.name.localeCompare(b.name);
        case 'strikes': return b.strikes - a.strikes || b.penalties - a.penalties;
        case 'lastseen': return (Date.parse(b.lastSeenAt) || 0) - (Date.parse(a.lastSeenAt) || 0);
        case 'name': return a.name.localeCompare(b.name);
        case 'stage': return b.actNumber - a.actNumber || a.name.localeCompare(b.name);
        default:
          return (
            Number(b.solved) - Number(a.solved) ||
            b.actNumber - a.actNumber ||
            progress(b) - progress(a) ||
            a.name.localeCompare(b.name)
          );
      }
    });
  }, [teams, query, filter, sort]);

  const announce = async (text, level) => {
    try {
      await post('/api/admin/announce', { text, level });
      setToast({ kind: 'ok', text: text ? 'Announcement posted to every team.' : 'Announcement cleared.' });
      await refresh();
    } catch {
      setToast({ kind: 'error', text: 'Could not post the announcement.' });
    }
  };

  const createTeam = async (name, code) => {
    try {
      const res = await post('/api/admin/teams', { name, code });
      setToast({ kind: 'ok', text: `Team ${res.name} created — code ${res.code}. Give this to the team; it is not shown again.` });
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      setToast({ kind: 'error', text: err.data?.error === 'team_exists' ? 'That team name or code is already in use.' : 'Could not create the team.' });
    }
  };

  return (
    <div className="admin">
      <header className="admin-header">
        <div className="admin-brand">
          <p className="admin-eyebrow">Prompt Arena · Event Control</p>
          <h1>Control Room</h1>
        </div>
        <div className="admin-chips">
          <span className={`admin-chip ${connected ? 'ok' : 'bad'}`}>{connected ? '● Live' : '● Reconnecting'}</span>
          {config?.eventMode != null && <span className="admin-chip">Event mode {config.eventMode ? 'on' : 'off'}</span>}
          <span className="admin-chip">Fullscreen {config?.fullscreen ? `enforced · ${Math.round((config.graceMs ?? 10000) / 1000)}s grace` : 'off'}</span>
          <span className="admin-chip">{config?.maxStrikes ?? 3} strikes = DQ</span>
          {config?.llm && <span className="admin-chip">AI suspects live</span>}
        </div>
        <div className="admin-header-actions">
          <button className="admin-button" onClick={refresh}>Refresh ↺</button>
          <a className="admin-button" href="/api/admin/export">Export CSV</a>
          <button
            className="admin-button danger-ghost"
            onClick={async () => {
              await post('/api/admin/logout').catch(() => {});
              onLoggedOut();
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {!data && <p className="admin-note">Loading the live board…</p>}

      {data && (
        <>
          <section className="admin-stats">
            <StatCard label="Teams" value={stats.teams} hint={`${stats.guestsPractice} preview saves`} />
            <StatCard label="Online now" value={stats.online} hint="seen in the last 45s" tone="ok" />
            <StatCard label="In play" value={stats.inPlay} hint={`${stats.notStarted} not started`} />
            <StatCard label="Solved" value={stats.solved} hint="case closed" />
            <StatCard label="Strike warnings" value={stats.warned} hint={`${stats.pendingExits} out right now`} tone={stats.warned ? 'warn' : undefined} />
            <StatCard label="Disqualified" value={stats.disqualified} hint={`${stats.exempt} exempt`} tone={stats.disqualified ? 'bad' : undefined} />
          </section>

          {disqualified.length > 0 && (
            <section className="admin-dq">
              <div className="admin-dq-head">
                <div>
                  <h2>Disqualified teams</h2>
                  <p>Clearing a team returns it to play immediately, at the exact stage it left.</p>
                </div>
                <button
                  className="admin-button"
                  onClick={async () => {
                    if (!window.confirm('Requalify EVERY disqualified team and reset all strikes?')) return;
                    await post('/api/admin/requalify-all');
                    setToast({ kind: 'ok', text: 'All blacklists and strikes cleared.' });
                    await refresh();
                    setRefreshTick((n) => n + 1);
                  }}
                >
                  Clear all
                </button>
              </div>
              <div className="admin-dq-list">
                {disqualified.map((t) => (
                  <div className="admin-dq-row" key={t.id}>
                    <div className="admin-dq-who">
                      <strong>{t.name}</strong>
                      <span>
                        {t.disqualifyReason === 'left_fullscreen'
                          ? 'Left fullscreen 3× without returning in time'
                          : t.disqualifyReason && t.disqualifyReason !== 'admin_decision'
                            ? `Removed by invigilator — ${t.disqualifyReason}`
                            : 'Removed by invigilator'}
                      </span>
                    </div>
                    <div className="admin-dq-when">
                      <span>{fmtDateTime(t.disqualifiedAt)}</span>
                      <small>{t.strikes} strikes</small>
                    </div>
                    <div className="admin-dq-actions">
                      <button className="admin-button primary" disabled={busyAction} onClick={() => runAction(t.id, 'requalify', { resetStrikes: true }, null, `${t.name} is back in play with a clean sheet.`)}>
                        Requalify + reset strikes
                      </button>
                      <button className="admin-button" disabled={busyAction} onClick={() => runAction(t.id, 'requalify', { resetStrikes: false }, null, `${t.name} is back; strikes kept.`)}>
                        Keep strikes
                      </button>
                      <button className="admin-button quiet" onClick={() => setSelected(t.id)}>Open</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="admin-split">
            <div className="admin-main">
              <AnnounceComposer current={data.announcement} onPost={announce} />

              <div className="admin-tabs">
                <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>Teams</button>
                <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Admin log</button>
                <span className="admin-tab-note">updated {fmtAgo(new Date(data.serverTime).toISOString(), now)}</span>
              </div>

              {tab === 'teams' && (
                <>
                  <div className="admin-toolbar">
                    <input className="admin-search" placeholder="Search team…" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                      <option value="all">All teams</option>
                      <option value="playing">Playing</option>
                      <option value="notstarted">Not started</option>
                      <option value="solved">Solved</option>
                      <option value="warned">Strike warnings</option>
                      <option value="dq">Disqualified</option>
                      <option value="exempt">Exempt</option>
                      <option value="extras">Guests & practice</option>
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value)}>
                      <option value="progress">Sort: progress</option>
                      <option value="stage">Sort: stage</option>
                      <option value="penalties">Sort: penalties</option>
                      <option value="strikes">Sort: strikes</option>
                      <option value="lastseen">Sort: last seen</option>
                      <option value="name">Sort: name</option>
                    </select>
                    <button className="admin-button" onClick={() => setCreateOpen((o) => !o)}>{createOpen ? 'Close' : '+ Team'}</button>
                  </div>

                  {createOpen && (
                    <CreateTeamForm onCreate={createTeam} />
                  )}

                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>Status</th>
                          <th>Current stage</th>
                          <th>Last passed</th>
                          <th className="num">Clues</th>
                          <th className="num">Puzzles</th>
                          <th className="num">Penalties</th>
                          <th className="num">Strikes</th>
                          <th>Last seen</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((t) => (
                          <tr key={t.id} className={t.disqualified ? 'dq' : t.pendingExit ? 'out' : ''}>
                            <td>
                              <button className="admin-team-link" onClick={() => setSelected(t.id)}>
                                <span className={`presence ${t.online ? 'on' : 'off'}`} />
                                {t.name}
                              </button>
                              {t.kind !== 'team' && <small className="kind-chip">{KIND_LABEL[t.kind] ?? t.kind}</small>}
                              {t.exempt && <small className="kind-chip exempt">exempt</small>}
                            </td>
                            <td>
                              {t.disqualified ? (
                                <span className="pill bad">Disqualified</span>
                              ) : t.solved ? (
                                <span className="pill ok">Solved</span>
                              ) : t.pendingExit ? (
                                <span className="pill warn">Outside</span>
                              ) : t.online ? (
                                <span className="pill ok">Active</span>
                              ) : t.actNumber === 0 ? (
                                <span className="pill">Waiting</span>
                              ) : (
                                <span className="pill">Away</span>
                              )}
                            </td>
                            <td>
                              <span className="stage-title">{t.actTitle ?? t.act}</span>
                              <small>{t.actEnteredAt ? `in stage ${fmtAgo(t.actEnteredAt, now)}` : '—'}</small>
                            </td>
                            <td>
                              <span className="stage-title">{t.lastPassedTitle ?? '—'}</span>
                              <small>{t.lastPassedAt ? `passed ${fmtTime(t.lastPassedAt)} · ${fmtAgo(t.lastPassedAt, now)}` : 'nothing yet'}</small>
                            </td>
                            <td className="num">
                              {t.discovered}
                              <small>/{t.totalClues}</small>
                            </td>
                            <td className="num">
                              {t.solvedPuzzles}
                              <small>/{t.totalPuzzles}</small>
                            </td>
                            <td className={`num ${t.penalties > 0 ? 'bad-text' : ''}`}>{t.penalties}</td>
                            <td className={`num ${t.strikes > 0 ? 'warn-text' : ''}`}>{t.strikes}/{t.maxStrikes}</td>
                            <td title={t.lastSeenAt ? fmtDateTime(t.lastSeenAt) : ''}>{fmtAgo(t.lastSeenAt, now)}</td>
                            <td className="row-actions">
                              <button className="admin-button quiet" onClick={() => setSelected(t.id)}>Manage</button>
                              {t.disqualified ? (
                                <button className="admin-button" disabled={busyAction} onClick={() => runAction(t.id, 'requalify', { resetStrikes: true }, null, `${t.name} requalified.`)}>
                                  Requalify
                                </button>
                              ) : (
                                <button
                                  className="admin-button quiet"
                                  disabled={busyAction}
                                  onClick={() => runAction(t.id, 'disqualify', { reason: 'admin_decision' }, `Disqualify ${t.name}?`, `${t.name} disqualified.`)}
                                >
                                  DQ
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visible.length === 0 && <p className="admin-note">No teams match this view.</p>}
                  </div>
                </>
              )}

              {tab === 'audit' && (
                <div className="admin-audit">
                  {!audit && <p className="admin-note">Loading the audit trail…</p>}
                  {audit && audit.entries.length === 0 && <p className="admin-note">No admin actions recorded yet.</p>}
                  {audit && audit.entries.length > 0 && (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Actor</th>
                          <th>Action</th>
                          <th>Team</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{fmtDateTime(entry.at)}</td>
                            <td>{entry.actor}</td>
                            <td><span className="pill">{entry.action}</span></td>
                            <td>{entry.team ?? '—'}</td>
                            <td className="audit-detail">{entry.detail ? JSON.stringify(entry.detail) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <aside className="admin-side">
              <section className="admin-panel">
                <h3>Act distribution</h3>
                <div className="admin-dist">
                  {(data.distribution ?? []).map((d) => {
                    const max = Math.max(1, ...data.distribution.map((x) => x.count));
                    return (
                      <div className="admin-dist-row" key={d.id}>
                        <span className="admin-dist-label">{d.title}</span>
                        <span className="admin-dist-bar"><span style={{ width: `${(d.count / max) * 100}%` }} /></span>
                        <span className="admin-dist-count">{d.count}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="admin-panel">
                <h3>Live activity</h3>
                <ul className="admin-feed">
                  {(data.recentEvents ?? []).slice(0, 22).map((ev) => (
                    <li key={ev.id}>
                      <span className={`feed-dot ${ev.type === 'exit_strike' || ev.type === 'disqualified' ? 'bad' : ev.type === 'exit' ? 'warn' : 'ok'}`} />
                      <div>
                        <strong>{ev.team ?? 'Unknown team'}</strong>
                        <span>{EVENT_LABELS[ev.type] ?? ev.type}{eventDetailText(ev) ? ` · ${eventDetailText(ev)}` : ''}</span>
                        <small>{fmtAgo(ev.at, now)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </section>
        </>
      )}

      {selected != null && (
        <TeamDrawer
          teamId={selected}
          now={now}
          version={refreshTick}
          busyAction={busyAction}
          onClose={() => setSelected(null)}
          runAction={runAction}
          onRefresh={refresh}
          setToast={setToast}
        />
      )}

      {toast && <div className={`admin-toast ${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
}

function StatCard({ label, value, hint, tone }) {
  return (
    <div className={`admin-stat ${tone ?? ''}`}>
      <p>{label}</p>
      <strong>{value ?? '—'}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function AnnounceComposer({ current, onPost }) {
  const [text, setText] = useState('');
  const [level, setLevel] = useState('info');
  const [busy, setBusy] = useState(false);
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    await onPost(text.trim(), level);
    setBusy(false);
    setText('');
  };
  return (
    <section className="admin-announce">
      <form onSubmit={send}>
        <span className="admin-eyebrow">{current ? 'Announcement live' : 'Broadcast to every team'}</span>
        {current && (
          <p className="admin-announce-current">
            <span className={`pill ${current.level === 'urgent' ? 'bad' : current.level === 'warning' ? 'warn' : ''}`}>{current.level}</span>
            {current.text}
          </p>
        )}
        <div className="admin-announce-controls">
          <input value={text} maxLength={300} placeholder="Message shown on every team's screen…" onChange={(e) => setText(e.target.value)} />
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="urgent">Urgent</option>
          </select>
          <button className="admin-button primary" disabled={busy || !text.trim()}>{current ? 'Replace' : 'Post'}</button>
          {current && (
            <button type="button" className="admin-button" disabled={busy} onClick={() => onPost('', 'info')}>
              Clear
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function CreateTeamForm({ onCreate }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onCreate(name.trim(), code.trim());
    setBusy(false);
  };
  return (
    <form className="admin-create" onSubmit={submit}>
      <input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      <input placeholder="Assigned code (optional)" value={code} onChange={(e) => setCode(e.target.value)} maxLength={48} />
      <button className="admin-button primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create team'}</button>
    </form>
  );
}

function TeamDrawer({ teamId, now, version, busyAction, onClose, runAction, onRefresh, setToast }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(false);
  const [rename, setRename] = useState('');
  const [note, setNote] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  const [penaltyDelta, setPenaltyDelta] = useState('');
  const [dqReason, setDqReason] = useState('');
  const [resetPenalty, setResetPenalty] = useState('0');
  const [stage, setStage] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [saving, setSaving] = useState(null);
  const renameRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    api(`/api/admin/teams/${teamId}`)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        if (!renameRef.current) setRename(d.team.name);
        if (!noteDirty) setNote(d.team.adminNote ?? '');
        setStage(d.team.act);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, version]);

  const team = detail?.team;
  const events = detail?.events ?? [];
  const shown = showAllEvents ? events : events.slice(0, 40);

  const act = async (action, payload, confirmText, successText, after) => {
    const result = await runAction(teamId, action, payload, confirmText, successText);
    if (result) {
      renameRef.current = false;
      setNoteDirty(false);
      if (after) after(result);
    }
  };

  return (
    <div className="admin-drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="admin-drawer" role="dialog" aria-modal="true" aria-label="Team detail">
        {error && <p className="admin-note">Could not load this team.</p>}
        {!detail && !error && <p className="admin-note">Loading team…</p>}
        {team && (
          <>
            <header className="admin-drawer-head">
              <div>
                <p className="admin-eyebrow">{KIND_LABEL[team.kind] ?? team.kind} · id {team.id}</p>
                <h2>
                  {team.name}
                  {team.disqualified && <span className="pill bad">Disqualified</span>}
                  {team.exempt && <span className="pill">Exempt</span>}
                  {team.online && <span className="pill ok">Online</span>}
                </h2>
                <p className="admin-drawer-sub">
                  {team.actTitle ?? team.act}
                  {team.actEnteredAt ? ` · stayed ${fmtAgo(team.actEnteredAt, now).replace(' ago', '')}` : ''}
                </p>
              </div>
              <button className="admin-close" onClick={onClose} aria-label="Close">×</button>
            </header>

            <div className="admin-drawer-scroll">
              <div className="admin-metrics">
                <Metric label="Current stage" value={team.actTitle ?? team.act} sub={team.actEnteredAt ? `entered ${fmtTime(team.actEnteredAt)}` : 'not started'} />
                <Metric label="Last stage passed" value={team.lastPassedTitle ?? '—'} sub={team.lastPassedAt ? `${fmtTime(team.lastPassedAt)} · ${fmtAgo(team.lastPassedAt, now)}` : 'nothing yet'} />
                <Metric label="Elapsed" value={fmtDuration(team.elapsedSeconds)} sub={team.solvedAt ? `solved ${fmtTime(team.solvedAt)}` : team.startedAt ? `started ${fmtTime(team.startedAt)}` : 'clock not started'} />
                <Metric label="Evidence" value={`${team.discovered}/${team.totalClues}`} sub={`${team.solvedPuzzles}/${team.totalPuzzles} puzzles`} />
                <Metric label="Penalties" value={team.penalties} tone={team.penalties > 0 ? 'bad' : undefined} sub={`${team.hintsUsed} hints`} />
                <Metric label="Exit strikes" value={`${team.strikes}/${team.maxStrikes}`} tone={team.strikes > 0 ? 'warn' : undefined} sub={team.pendingExit ? `currently outside (${team.pendingExit.kind})` : 'in the arena'} />
                <Metric label="Last seen" value={fmtAgo(team.lastSeenAt, now)} sub={team.lastSeenAt ? fmtDateTime(team.lastSeenAt) : 'never'} />
                <Metric label="Created" value={fmtDateTime(team.createdAt)} sub={team.solved ? 'Case closed' : ''} />
              </div>

              {team.accusation && (
                <section className="admin-panel">
                  <h3>Accusation</h3>
                  <p className="admin-accuse">
                    <strong>{team.accusation.culprit}</strong> — method: {team.accusation.method || '—'}
                  </p>
                  <p className="admin-accuse">Motive: {team.accusation.motive || '—'}</p>
                </section>
              )}

              <section className="admin-panel">
                <h3>Enforcement</h3>
                <div className="admin-action-row">
                  <button className="admin-button primary" disabled={!!busyAction} onClick={() => act('requalify', { resetStrikes: true }, null, 'Requalified with a clean sheet.')}>
                    Requalify + reset strikes
                  </button>
                  <button className="admin-button" disabled={!!busyAction} onClick={() => act('requalify', { resetStrikes: false }, null, 'Requalified; strikes kept.')}>
                    Requalify, keep strikes
                  </button>
                  <button className="admin-button" disabled={!!busyAction} onClick={() => act('exempt', { exempt: !team.exempt }, null, team.exempt ? 'Exemption removed.' : 'Team exempted from automatic disqualification.')}>
                    {team.exempt ? 'Remove exemption' : 'Exempt from auto-DQ'}
                  </button>
                </div>
                <div className="admin-action-row">
                  <label>
                    Set strikes
                    <span className="admin-inline">
                      {[0, 1, 2, 3].map((n) => (
                        <button key={n} className={`admin-button quiet ${team.strikes === n ? 'selected' : ''}`} disabled={!!busyAction} onClick={() => act('strikes', { strikes: n }, null, `Strikes set to ${n}.`)}>
                          {n}
                        </button>
                      ))}
                    </span>
                  </label>
                </div>
                <div className="admin-action-row">
                  <input placeholder="Reason shown on their screen…" value={dqReason} onChange={(e) => setDqReason(e.target.value)} maxLength={200} />
                  <button
                    className="admin-button danger"
                    disabled={!!busyAction}
                    onClick={() => act('disqualify', { reason: dqReason || undefined }, `Disqualify ${team.name}?`, 'Team disqualified.')}
                  >
                    Disqualify now
                  </button>
                </div>
              </section>

              <section className="admin-panel">
                <h3>Game controls</h3>
                <div className="admin-action-row">
                  <label>
                    Move to stage
                    <span className="admin-inline">
                      <select value={stage} onChange={(e) => setStage(e.target.value)}>
                        {(detail.stages ?? []).map((s) => (
                          <option key={s.id} value={s.id}>{s.id} — {s.title}</option>
                        ))}
                        {!detail.stages && <option value={team.act}>{team.act}</option>}
                      </select>
                      <button className="admin-button" disabled={!!busyAction || stage === team.act} onClick={() => act('stage', { act: stage }, `Move ${team.name} to ${stage}?`, `Moved to ${stage}.`)}>
                        Apply
                      </button>
                    </span>
                  </label>
                </div>
                <div className="admin-action-row">
                  <label>
                    Adjust penalties
                    <span className="admin-inline">
                      <input type="number" value={penaltyDelta} onChange={(e) => setPenaltyDelta(e.target.value)} placeholder="e.g. 5 or -5" />
                      <button className="admin-button" disabled={!!busyAction || !penaltyDelta} onClick={() => act('penalties', { delta: Number(penaltyDelta) || 0 }, null, 'Penalties adjusted.')}>
                        Apply
                      </button>
                    </span>
                  </label>
                </div>
                <div className="admin-action-row">
                  <label>
                    Reset run (back to Act 0, clears evidence)
                    <span className="admin-inline">
                      <input type="number" value={resetPenalty} min="0" onChange={(e) => setResetPenalty(e.target.value)} placeholder="Extra penalty (optional)" />
                      <button className="admin-button" disabled={!!busyAction} onClick={() => act('reset', { penalty: Number(resetPenalty) || 0 }, `Reset ${team.name}'s entire run?`, 'Run reset to Act 0.')}>
                        Reset run
                      </button>
                    </span>
                  </label>
                </div>
                <div className="admin-action-row">
                  <label>
                    Danger zone
                    <span className="admin-inline">
                      <button className="admin-button danger" disabled={!!busyAction} onClick={() => act('delete', {}, `Permanently delete ${team.name}, its progress, chat and events?\n\nThis cannot be undone.`, 'Team deleted.')}>
                        Delete team
                      </button>
                    </span>
                  </label>
                </div>
              </section>

              <section className="admin-panel">
                <h3>Identity</h3>
                <div className="admin-action-row">
                  <label>
                    Rename team
                    <span className="admin-inline">
                      <input value={rename} maxLength={40} onChange={(e) => { renameRef.current = true; setRename(e.target.value); }} />
                      <button className="admin-button" disabled={!!busyAction || !rename.trim() || rename === team.name} onClick={() => act('rename', { name: rename }, null, 'Team renamed.')}>
                        Save
                      </button>
                    </span>
                  </label>
                </div>
                <div className="admin-action-row">
                  <label>
                    Invigilator note (only visible here)
                    <span className="admin-inline">
                      <textarea value={note} rows={2} maxLength={500} onChange={(e) => { setNoteDirty(true); setNote(e.target.value); }} />
                      <button className="admin-button" disabled={!!busyAction || !noteDirty} onClick={() => act('note', { text: note }, null, 'Note saved.')}>
                        Save
                      </button>
                    </span>
                  </label>
                </div>
              </section>

              {(detail.chatCounts ?? []).length > 0 && (
                <section className="admin-panel">
                  <h3>Interrogations</h3>
                  <div className="admin-chats">
                    {detail.chatCounts.map((c) => (
                      <span key={c.character} className="admin-chip">
                        {c.character}: {c.messages}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <section className="admin-panel">
                <h3>Timeline</h3>
                <ul className="admin-timeline">
                  {shown.map((ev) => (
                    <li key={ev.id} className={ev.type === 'exit_strike' || ev.type === 'disqualified' ? 'bad' : ev.type === 'exit' ? 'warn' : ''}>
                      <span className="admin-time">{fmtTime(ev.at)}</span>
                      <div>
                        <strong>{EVENT_LABELS[ev.type] ?? ev.type}</strong>
                        {eventDetailText(ev) && <span> · {eventDetailText(ev)}</span>}
                        <small>{fmtDateTime(ev.at)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
                {events.length > shown.length && (
                  <button className="admin-button quiet" onClick={() => setShowAllEvents(true)}>Show all {events.length} events</button>
                )}
              </section>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Metric({ label, value, sub, tone }) {
  return (
    <div className={`admin-metric ${tone ?? ''}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
