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
  accusation: 'Accusation',
  restart: 'Run restarted',
  disqualified: 'Disqualified',
  requalified: 'Requalified',
  admin_penalties: 'Penalties adjusted',
  admin_stage: 'Stage moved',
  admin_reset: 'Run reset',
  guest_start: 'Guest preview started',
  practice_start: 'Practice started',
  team_created: 'Team created',
  ending: 'Ending reached',
};

const LOG_TYPES = [
  ['', 'All events'],
  ['login', 'Sign-ins'],
  ['act_complete', 'Acts completed'],
  ['clue_found', 'Evidence found'],
  ['puzzle_solve', 'Puzzle attempts'],
  ['accusation', 'Accusations'],
  ['restart', 'Restarts'],
  ['disqualified', 'Disqualifications'],
  ['requalified', 'Requalifications'],
  ['admin_penalties', 'Admin: penalties'],
  ['admin_stage', 'Admin: stage moves'],
  ['admin_reset', 'Admin: run resets'],
  ['practice_start', 'Practice saves'],
  ['guest_start', 'Guest previews'],
  ['team_created', 'Teams created'],
];

const AUDIT_ACTIONS = [
  ['', 'All actions'],
  ['admin_login', 'Sign-ins'],
  ['requalify', 'Requalify'],
  ['requalify_all', 'Requalify all'],
  ['disqualify', 'Disqualify'],
  ['penalties', 'Penalties'],
  ['stage', 'Stage moves'],
  ['rename', 'Renames'],
  ['note', 'Notes'],
  ['reset', 'Run resets'],
  ['reset_all', 'Reset all runs'],
  ['create_team', 'Team creation'],
  ['delete_team', 'Team deletion'],
  ['announce', 'Announcements'],
  ['announce_clear', 'Announcement clears'],
];

const logTone = (type) =>
  type === 'disqualified'
    ? 'bad'
    : type === 'restart'
      ? 'warn'
      : type === 'requalified'
        ? 'ok'
        : '';

const eventDetailText = (ev) => {
  const d = ev.detail ?? {};
  switch (ev.type) {
    case 'act_complete':
      return d.endcard || d.next ? `→ ${d.next ?? d.act}` : '';
    case 'clue_found':
      return d.name ?? d.clue ?? '';
    case 'puzzle_solve':
      return `${d.puzzle ?? ''}${d.correct ? ' · correct' : ''}${d.penalty ? ` · +${d.penalty} penalties` : ''}${d.alreadySolved ? ' · repeat' : ''}`;
    case 'disqualified':
      return d.reason ?? '';
    case 'admin_penalties':
      return `${d.delta >= 0 ? '+' : ''}${d.delta} → ${d.penalties}`;
    case 'admin_stage':
      return `→ ${d.act}`;
    case 'restart':
      return `${d.from === 'recent' ? `resumed ${d.act ?? 'act'} · ` : ''}+${d.penalty} penalties`;
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
        <span className="admin-mark admin-login-mark" aria-hidden="true">◒</span>
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
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [now, setNow] = useState(Date.now());
  // The insights rail opens by default only when the table still has room.
  const [insightsOpen, setInsightsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1560);
  // Event log (every team's story) and admin log (who did what) each have
  // their own filters, pagination and CSV export.
  const [log, setLog] = useState({ entries: [], total: 0 });
  const [logType, setLogType] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [logTeam, setLogTeam] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [audit, setAudit] = useState({ entries: [], total: 0 });
  const [auditQuery, setAuditQuery] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const logEntriesRef = useRef([]);
  const auditEntriesRef = useRef([]);

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
    logEntriesRef.current = log.entries;
  }, [log.entries]);
  useEffect(() => {
    auditEntriesRef.current = audit.entries;
  }, [audit.entries]);

  const loadLog = useCallback(
    async ({ append = false } = {}) => {
      setLogLoading(true);
      const params = new URLSearchParams({ limit: '60' });
      if (append) params.set('offset', String(logEntriesRef.current.length));
      if (logType) params.set('type', logType);
      if (logQuery.trim()) params.set('q', logQuery.trim());
      if (logTeam) params.set('team', String(logTeam));
      try {
        const res = await api(`/api/admin/log?${params}`);
        setLog((prev) => (append ? { ...res, entries: [...prev.entries, ...res.entries] } : res));
      } catch {
        setToast({ kind: 'error', text: 'Could not load the event log.' });
      } finally {
        setLogLoading(false);
      }
    },
    [logType, logQuery, logTeam]
  );

  const loadAudit = useCallback(
    async ({ append = false } = {}) => {
      setAuditLoading(true);
      const params = new URLSearchParams({ limit: '60' });
      if (append) params.set('offset', String(auditEntriesRef.current.length));
      if (auditAction) params.set('action', auditAction);
      if (auditQuery.trim()) params.set('q', auditQuery.trim());
      try {
        const res = await api(`/api/admin/audit?${params}`);
        setAudit((prev) => (append ? { ...res, entries: [...prev.entries, ...res.entries] } : res));
      } catch {
        setToast({ kind: 'error', text: 'Could not load the admin log.' });
      } finally {
        setAuditLoading(false);
      }
    },
    [auditAction, auditQuery]
  );

  useEffect(() => {
    if (tab !== 'log') return;
    const timer = setTimeout(() => loadLog(), 200);
    return () => clearTimeout(timer);
  }, [tab, loadLog]);

  useEffect(() => {
    if (tab !== 'audit') return;
    const timer = setTimeout(() => loadAudit(), 200);
    return () => clearTimeout(timer);
  }, [tab, loadAudit]);

  const logExportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (logType) params.set('type', logType);
    if (logQuery.trim()) params.set('q', logQuery.trim());
    if (logTeam) params.set('team', String(logTeam));
    const qs = params.toString();
    return `/api/admin/export/log${qs ? `?${qs}` : ''}`;
  }, [logType, logQuery, logTeam]);

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
  const disqualified = teams.filter((t) => t.disqualified);

  // The same ranking players see on the live leaderboard: solved teams first
  // (fastest finish), then furthest stage, then quickest clock. Disqualified
  // teams and preview saves are excluded and listed separately below it.
  const board = useMemo(() => {
    const isEvent = !!data?.config?.eventMode;
    const eligible = teams.filter(
      (t) =>
        t.kind === 'team' &&
        !t.disqualified &&
        t.name !== 'Instructor preview' &&
        (!isEvent || t.eventEntered)
    );
    const ranked = [...eligible].sort(
      (a, b) =>
        Number(b.solved) - Number(a.solved) ||
        b.actNumber - a.actNumber ||
        a.elapsedSeconds - b.elapsedSeconds ||
        a.name.localeCompare(b.name)
    );
    return ranked.map((t, i) => ({ ...t, rank: i + 1 }));
  }, [teams, data?.config?.eventMode]);

  const excludedFromBoard = useMemo(() => {
    const isEvent = !!data?.config?.eventMode;
    return teams
      .filter(
        (t) =>
          t.disqualified ||
          t.name === 'Instructor preview' ||
          t.kind !== 'team' ||
          (isEvent && !t.eventEntered)
      )
      .map((t) => ({
        ...t,
        exclusion: t.disqualified
          ? t.disqualifyReason === 'admin_decision'
            ? 'Disqualified by an invigilator'
            : `Disqualified — ${t.disqualifyReason ?? 'unknown reason'}`
          : t.kind !== 'team'
            ? t.kind === 'practice' ? 'Practice save' : t.kind === 'guest' ? 'Guest preview' : 'Google sign-in'
            : t.name === 'Instructor preview'
              ? 'Instructor preview'
              : 'Has not entered the event',
      }));
  }, [teams, data?.config?.eventMode]);

  const boardClock = (t) => {
    if (t.solved) return t.elapsedSeconds;
    if (!data?.serverTime || t.actNumber === 0) return t.elapsedSeconds;
    return t.elapsedSeconds + Math.max(0, (now - Date.parse(data.serverTime)) / 1000);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = teams.filter((t) => !q || t.name.toLowerCase().includes(q));
    list = list.filter((t) => {
      switch (filter) {
        case 'playing': return t.actNumber > 0 && !t.solved && !t.disqualified;
        case 'notstarted': return t.actNumber === 0 && !t.solved && !t.disqualified;
        case 'solved': return t.solved;
        case 'dq': return t.disqualified;
        case 'extras': return t.kind !== 'team';
        default: return true;
      }
    });
    const progress = (t) => t.discovered + t.solvedPuzzles;
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'penalties': return b.penalties - a.penalties || a.name.localeCompare(b.name);
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
      return true;
    } catch {
      setToast({ kind: 'error', text: 'Could not post the announcement.' });
      return false;
    }
  };

  return (
    <div className="admin">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-mark" aria-hidden="true">◒</span>
          <div>
            <p className="admin-eyebrow">Prompt Arena · Event Control</p>
            <h1>Control Room</h1>
          </div>
        </div>
        <div className="admin-header-actions">
          <button className="admin-button" onClick={refresh} title="Fetch the latest state now">Refresh</button>
          <a className="admin-button" href="/api/admin/export" title="Final standings with rank and score">Results CSV</a>
          <a className="admin-button" href="/api/admin/export/feedback" title="Every piece of player feedback from the ending screen">Feedback CSV</a>
          <button
            className="admin-button danger-ghost"
            disabled={busyAction === 'reset-all'}
            title="Return every team to the opening prologue"
            onClick={async () => {
              const answer = window.prompt('This resets EVERY team to the opening prologue: progress, penalties, transcripts and disqualifications. Type RESET to confirm.');
              if (answer !== 'RESET') return;
              setBusyAction('reset-all');
              try {
                const res = await post('/api/admin/reset-all', { clearMessages: true });
                setToast({ kind: 'ok', text: `All ${res.teams} teams are back at the beginning.` });
                await refresh();
                setRefreshTick((n) => n + 1);
              } catch {
                setToast({ kind: 'error', text: 'Could not reset all teams.' });
              } finally {
                setBusyAction(null);
              }
            }}
          >
            Reset all runs
          </button>
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

      {!connected && (
        <div className="admin-offline" role="status">
          Connection interrupted — retrying automatically. The board may be a few seconds stale.
        </div>
      )}

      {!data && <p className="admin-note">Loading the live board…</p>}

      {data && (
        <>
          {disqualified.length > 0 && (
            <section className="admin-dq">
              <div className="admin-dq-head">
                <div>
                  <h2>
                    <span className="admin-dq-dot" /> {disqualified.length} disqualified {disqualified.length === 1 ? 'team' : 'teams'}
                  </h2>
                  <p>Clearing a team returns it to play immediately, at the exact stage it left.</p>
                </div>
                <button
                  className="admin-button"
                  onClick={async () => {
                    if (!window.confirm('Requalify EVERY disqualified team?')) return;
                    await post('/api/admin/requalify-all');
                    setToast({ kind: 'ok', text: 'All blacklists cleared.' });
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
                        {t.disqualifyReason && t.disqualifyReason !== 'admin_decision'
                          ? `Removed by invigilator — ${t.disqualifyReason}`
                          : 'Removed by invigilator'}
                      </span>
                    </div>
                    <div className="admin-dq-when">
                      <span title={t.disqualifiedAt ? fmtDateTime(t.disqualifiedAt) : ''}>{fmtAgo(t.disqualifiedAt, now)}</span>
                      <small>{fmtDateTime(t.disqualifiedAt)}</small>
                    </div>
                    <div className="admin-dq-actions">
                      <button className="admin-button primary" disabled={busyAction} onClick={() => runAction(t.id, 'requalify', null, null, `${t.name} is back in play.`)}>
                        Requalify
                      </button>
                      <button className="admin-button quiet" onClick={() => setSelected(t.id)}>Open</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="admin-stats">
            <StatCard label="Teams" value={stats.teams} hint={`${stats.guestsPractice} preview saves`} />
            <StatCard label="Online now" value={stats.online} hint="seen in the last 45s" tone="ok" />
            <StatCard label="In play" value={stats.inPlay} hint={`${stats.notStarted} not started`} />
            <StatCard label="Solved" value={stats.solved} hint="case closed" />
            <StatCard label="Disqualified" value={stats.disqualified} tone={stats.disqualified ? 'bad' : undefined} />
          </section>

          <section className={`admin-split ${insightsOpen ? '' : 'solo'}`}>
            <div className="admin-main">
              <AnnounceComposer current={data.announcement} onPost={announce} />

              <div className="admin-tabs">
                <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>Teams</button>
                <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>Leaderboard</button>
                <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>Event log</button>
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
                      <option value="dq">Disqualified</option>
                      <option value="extras">Guests & practice</option>
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value)}>
                      <option value="progress">Sort: progress</option>
                      <option value="stage">Sort: stage</option>
                      <option value="penalties">Sort: penalties</option>
                      <option value="lastseen">Sort: last seen</option>
                      <option value="name">Sort: name</option>
                    </select>
                    <button
                      className={`admin-button ${insightsOpen ? 'selected' : ''}`}
                      onClick={() => setInsightsOpen((o) => !o)}
                      title="Act distribution and live activity"
                    >
                      Insights
                    </button>
                  </div>

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
                          <th className="seen-cell">Seen</th>
                          <th className="actions-cell" />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((t) => (
                          <tr key={t.id} className={t.disqualified ? 'dq' : ''}>
                            <td>
                              <button className="admin-team-link" onClick={() => setSelected(t.id)}>
                                <span className={`presence ${t.online ? 'on' : 'off'}`} />
                                {t.name}
                              </button>
                              {t.kind !== 'team' && <small className="kind-chip">{KIND_LABEL[t.kind] ?? t.kind}</small>}
                            </td>
                            <td>
                              {t.disqualified ? (
                                <span className="pill bad">Disqualified</span>
                              ) : t.solved ? (
                                <span className="pill ok">Solved</span>
                              ) : t.online ? (
                                <span className="pill ok">Active</span>
                              ) : t.actNumber === 0 ? (
                                <span className="pill">Waiting</span>
                              ) : (
                                <span className="pill">Away</span>
                              )}
                            </td>
                            <td>
                              <span className="stage-title" title={t.actTitle ?? t.act}>{t.actTitle ?? t.act}</span>
                              <small>{t.actEnteredAt ? `entered ${fmtAgo(t.actEnteredAt, now)}` : '—'}</small>
                            </td>
                            <td>
                              <span className="stage-title" title={t.lastPassedTitle ?? ''}>{t.lastPassedTitle ?? '—'}</span>
                              <small title={t.lastPassedAt ? fmtDateTime(t.lastPassedAt) : ''}>{t.lastPassedAt ? `passed ${fmtAgo(t.lastPassedAt, now)}` : 'nothing yet'}</small>
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
                            <td className="seen-cell" title={t.lastSeenAt ? fmtDateTime(t.lastSeenAt) : ''}>{fmtAgo(t.lastSeenAt, now)}</td>
                            <td className="actions-cell">
                              <div className="row-actions">
                                <button className="admin-button quiet" onClick={() => setSelected(t.id)}>Manage</button>
                                {t.disqualified ? (
                                  <button className="admin-button" disabled={busyAction} onClick={() => runAction(t.id, 'requalify', null, null, `${t.name} requalified.`)}>
                                    Requalify
                                  </button>
                                ) : (
                                  <button
                                    className="admin-button quiet dq-quick"
                                    disabled={busyAction}
                                    title={`Disqualify ${t.name}`}
                                    onClick={() => runAction(t.id, 'disqualify', { reason: 'admin_decision' }, `Disqualify ${t.name}?`, `${t.name} disqualified.`)}
                                  >
                                    DQ
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visible.length === 0 && <p className="admin-note">No teams match this view.</p>}
                  </div>
                </>
              )}

              {tab === 'board' && (
                <div className="admin-board">
                  <div className="admin-board-head">
                    <p className="admin-board-note">
                      Exactly what players see on the live leaderboard — solved teams first, then furthest stage, then the quickest clock.
                      Disqualified teams and preview saves never rank.
                    </p>
                    <a className="admin-button" href="/api/admin/export" title="Final standings with rank and score">Results CSV</a>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-board-table">
                      <thead>
                        <tr>
                          <th className="num">#</th>
                          <th>Team</th>
                          <th>Status</th>
                          <th>Latest act</th>
                          <th className="num">Clues</th>
                          <th className="num">Puzzles</th>
                          <th className="num">Penalties</th>
                          <th className="num">Time</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {board.map((t) => (
                          <tr key={t.id}>
                            <td className="num">
                              <span className={`board-rank rank-${Math.min(t.rank, 4)}`}>{t.rank}</span>
                            </td>
                            <td>
                              <button className="admin-team-link" onClick={() => setSelected(t.id)}>
                                <span className={`presence ${t.online ? 'on' : 'off'}`} />
                                {t.name}
                              </button>
                            </td>
                            <td>
                              {t.solved ? (
                                <span className="pill ok">Solved</span>
                              ) : t.online ? (
                                <span className="pill ok">Active</span>
                              ) : (
                                <span className="pill">Away</span>
                              )}
                            </td>
                            <td>
                              <span className="stage-title">{t.solved ? 'Case complete' : t.actTitle ?? t.act}</span>
                              <small>{t.solvedAt ? `solved ${fmtAgo(t.solvedAt, now)}` : t.actEnteredAt ? `entered ${fmtAgo(t.actEnteredAt, now)}` : '—'}</small>
                            </td>
                            <td className="num">{t.discovered}<small>/{t.totalClues}</small></td>
                            <td className="num">{t.solvedPuzzles}<small>/{t.totalPuzzles}</small></td>
                            <td className={`num ${t.penalties > 0 ? 'bad-text' : ''}`}>{t.penalties}</td>
                            <td className="num board-clock">{t.actNumber === 0 ? '—' : fmtDuration(boardClock(t))}</td>
                            <td className="actions-cell">
                              <div className="row-actions">
                                <button className="admin-button quiet" onClick={() => setSelected(t.id)}>Manage</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {board.length === 0 && <p className="admin-note">No teams are on the board yet.</p>}
                  </div>
                  {excludedFromBoard.length > 0 && (
                    <section className="admin-excluded">
                      <h3>Not on the board ({excludedFromBoard.length})</h3>
                      <ul>
                        {excludedFromBoard.map((t) => (
                          <li key={t.id}>
                            <button className="admin-team-link" onClick={() => setSelected(t.id)}>{t.name}</button>
                            <span>{t.exclusion}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}

              {tab === 'log' && (
                <div className="admin-audit">
                  <div className="admin-toolbar">
                    <input className="admin-search" placeholder="Search team or detail…" value={logQuery} onChange={(e) => setLogQuery(e.target.value)} />
                    <select value={logType} onChange={(e) => setLogType(e.target.value)}>
                      {LOG_TYPES.map(([value, label]) => (
                        <option key={value || 'all'} value={value}>{label}</option>
                      ))}
                    </select>
                    {logTeam != null && (
                      <button className="admin-button selected" onClick={() => setLogTeam(null)} title="Clear the team filter">
                        {teams.find((t) => t.id === logTeam)?.name ?? `Team ${logTeam}`} ×
                      </button>
                    )}
                    <button className="admin-button" onClick={() => loadLog()} disabled={logLoading}>
                      {logLoading ? 'Loading…' : 'Reload'}
                    </button>
                    <a className="admin-button" href={logExportHref}>Export CSV</a>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-log-table">
                      <thead>
                        <tr>
                          <th className="seen-cell">When</th>
                          <th>Team</th>
                          <th>Event</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {log.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="seen-cell" title={fmtDateTime(entry.at)}>
                              {fmtAgo(entry.at, now)}
                              <small>{fmtTime(entry.at)}</small>
                            </td>
                            <td>
                              {entry.team ? (
                                <button className="admin-team-link" onClick={() => setLogTeam(entry.teamId)} title="Filter the log by this team">
                                  {entry.team}
                                </button>
                              ) : (
                                <span className="admin-faint">—</span>
                              )}
                            </td>
                            <td><span className={`log-type ${logTone(entry.type)}`}>{EVENT_LABELS[entry.type] ?? entry.type}</span></td>
                            <td className="audit-detail">{entry.summary || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {log.entries.length === 0 && !logLoading && <p className="admin-note">No events match this view.</p>}
                  </div>
                  <div className="admin-log-foot">
                    <span>Showing {log.entries.length} of {log.total} events</span>
                    {log.entries.length < log.total && (
                      <button className="admin-button" onClick={() => loadLog({ append: true })} disabled={logLoading}>
                        {logLoading ? 'Loading…' : 'Load more'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {tab === 'audit' && (
                <div className="admin-audit">
                  <div className="admin-toolbar">
                    <input className="admin-search" placeholder="Search actor, action or team…" value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} />
                    <select value={auditAction} onChange={(e) => setAuditAction(e.target.value)}>
                      {AUDIT_ACTIONS.map(([value, label]) => (
                        <option key={value || 'all'} value={value}>{label}</option>
                      ))}
                    </select>
                    <button className="admin-button" onClick={() => loadAudit()} disabled={auditLoading}>
                      {auditLoading ? 'Loading…' : 'Reload'}
                    </button>
                    <a className="admin-button" href="/api/admin/export/audit">Export CSV</a>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th className="seen-cell">When</th>
                          <th>Actor</th>
                          <th>Action</th>
                          <th>Team</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="seen-cell" title={fmtDateTime(entry.at)}>
                              {fmtAgo(entry.at, now)}
                              <small>{fmtTime(entry.at)}</small>
                            </td>
                            <td>{entry.actor}</td>
                            <td><span className="pill">{entry.action}</span></td>
                            <td>
                              {entry.team ? (
                                <button className="admin-team-link" onClick={() => setSelected(entry.teamId)}>{entry.team}</button>
                              ) : (
                                <span className="admin-faint">—</span>
                              )}
                            </td>
                            <td className="audit-detail">{entry.detail ? JSON.stringify(entry.detail) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {audit.entries.length === 0 && !auditLoading && <p className="admin-note">No admin actions match this view.</p>}
                  </div>
                  <div className="admin-log-foot">
                    <span>Showing {audit.entries.length} of {audit.total} actions</span>
                    {audit.entries.length < audit.total && (
                      <button className="admin-button" onClick={() => loadAudit({ append: true })} disabled={auditLoading}>
                        {auditLoading ? 'Loading…' : 'Load more'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {insightsOpen && (
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
                <div className="admin-panel-head">
                  <h3>Live activity</h3>
                  <button className="admin-link" onClick={() => setTab('log')}>View all →</button>
                </div>
                <ul className="admin-feed">
                  {(data.recentEvents ?? []).slice(0, 22).map((ev) => {
                    const tone = logTone(ev.type) || 'ok';
                    return (
                      <li key={ev.id}>
                        <span className={`feed-avatar ${tone}`}>{(ev.team ?? '?').trim().slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>{ev.team ?? 'Unknown team'}</strong>
                          <span>{EVENT_LABELS[ev.type] ?? ev.type}{ev.summary ? ` · ${ev.summary}` : ''}</span>
                          <small>{fmtAgo(ev.at, now)}</small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </aside>
            )}
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
    const ok = await onPost(text.trim(), level);
    setBusy(false);
    if (ok !== false) setText('');
  };
  return (
    <section className="admin-announce">
      <div className="admin-announce-head">
        <span className="admin-eyebrow">Broadcast</span>
        {current ? (
          <span className={`pill ${current.level === 'urgent' ? 'bad' : current.level === 'warning' ? 'warn' : 'ok'}`}>{current.level} · live</span>
        ) : (
          <span className="admin-announce-hint">Appears on every team&rsquo;s screen within seconds</span>
        )}
      </div>
      {current && <p className="admin-announce-current">{current.text}</p>}
      <form className="admin-announce-controls" onSubmit={send}>
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
      </form>
    </section>
  );
}

function TeamDrawer({ teamId, now, version, busyAction, onClose, runAction }) {
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

  // Escape closes the drawer, like every other panel in the game.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
                  {team.online && <span className="pill ok">Online</span>}
                </h2>
                <p className="admin-drawer-sub">
                  {team.actTitle ?? team.act}
                  {team.actEnteredAt ? ` · entered ${fmtAgo(team.actEnteredAt, now)}` : ''}
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
                <h3>Suspension</h3>
                <div className="admin-action-row">
                  {team.disqualified ? (
                    <button className="admin-button primary" disabled={!!busyAction} onClick={() => act('requalify', null, null, 'Requalified — back in play.')}>
                      Requalify — back in play
                    </button>
                  ) : (
                    <span className="admin-note">Blacklists a team from the leaderboard and locks it out of play.</span>
                  )}
                </div>
                <div className="admin-action-row">
                  <input placeholder="Reason (optional)…" value={dqReason} onChange={(e) => setDqReason(e.target.value)} maxLength={200} />
                  <button
                    className="admin-button danger"
                    disabled={!!busyAction}
                    onClick={() => act('disqualify', { reason: dqReason || undefined }, `Disqualify ${team.name}?`, 'Team disqualified.', () => setDqReason(''))}
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
                      <button className="admin-button" disabled={!!busyAction || stage === team.act} onClick={() => act('stage', { act: stage }, `Move ${team.name} to ${stage}? They keep their own progress and receive every clue and puzzle from the acts behind it.`, `Moved to ${stage} — previous acts granted.`)}>
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
                      <button className="admin-button" disabled={!!busyAction || !penaltyDelta} onClick={() => act('penalties', { delta: Number(penaltyDelta) || 0 }, null, 'Penalties adjusted.', () => setPenaltyDelta(''))}>
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
                      <button className="admin-button danger" disabled={!!busyAction} onClick={() => act('delete', {}, `Permanently delete ${team.name}, its progress, chat and events?\n\nThis cannot be undone.`, 'Team deleted.', () => onClose())}>
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
                <div className="admin-panel-head">
                  <h3>Timeline</h3>
                  <a className="admin-link" href={`/api/admin/teams/${team.id}/export`}>Export CSV</a>
                </div>
                <ul className="admin-timeline">
                  {shown.map((ev) => (
                    <li key={ev.id} className={logTone(ev.type)}>
                      <span className="admin-time">{fmtTime(ev.at)}</span>
                      <div>
                        <strong>{EVENT_LABELS[ev.type] ?? ev.type}</strong>
                        {(ev.summary || eventDetailText(ev)) && <span> · {ev.summary || eventDetailText(ev)}</span>}
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
