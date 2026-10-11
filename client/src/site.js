/* Prompt Arena: Mystery — title card behaviour.
   Cinematic card, live leaderboard, audio settings the game inherits, and a
   direct hand-off into the game once a team code is accepted. */

(() => {
  const root = document.documentElement;
  const enter = document.getElementById('enter');
  const settingsStore = 'moon-settings';
  const muteStash = 'moon-settings-before-mute';
  const INTRO_MS = 2600;
  const REFRESH_MS = 5000;
  const GAME = '/play/?resume=1';

  /* ---------- the card plays, or is dismissed by a click / key ---------- */
  let entered = false;
  const enterNow = () => {
    if (entered) return;
    entered = true;
    root.classList.add('is-entered');
    window.removeEventListener('pointerdown', enterNow);
    window.removeEventListener('keydown', enterNow);
  };
  const cardTimer = setTimeout(enterNow, INTRO_MS);
  window.addEventListener('pointerdown', enterNow);
  window.addEventListener('keydown', enterNow);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    clearTimeout(cardTimer);
    enterNow();
  }

  /* ---------- settings the game shares ---------- */
  const defaults = () => ({ quality: window.innerWidth < 700 ? 'low' : 'medium', sound: false, narration: false });
  const readSettings = () => {
    try {
      return { ...defaults(), ...JSON.parse(localStorage.getItem(settingsStore) || '{}') };
    } catch {
      return defaults();
    }
  };
  const writeSettings = (patch) => {
    const next = { ...readSettings(), ...patch };
    try {
      localStorage.setItem(settingsStore, JSON.stringify(next));
    } catch {}
    return next;
  };
  const isMuted = (settings) => !settings.sound && !settings.narration;

  const muteBtn = document.getElementById('mute-btn');
  const soundBox = document.getElementById('set-sound');
  const narrationBox = document.getElementById('set-narration');
  const qualityBox = document.getElementById('set-quality');

  const paintAudio = () => {
    const settings = readSettings();
    const muted = isMuted(settings);
    muteBtn.textContent = muted ? 'Unmute audio' : 'Mute audio';
    muteBtn.setAttribute('aria-pressed', String(muted));
    soundBox.checked = !!settings.sound;
    narrationBox.checked = !!settings.narration;
    qualityBox.value = settings.quality;
  };

  muteBtn.addEventListener('click', () => {
    const settings = readSettings();
    if (isMuted(settings)) {
      let previous = { sound: true, narration: true };
      try {
        const raw = localStorage.getItem(muteStash);
        if (raw) previous = { ...previous, ...JSON.parse(raw) };
      } catch {}
      writeSettings({ sound: !!previous.sound, narration: !!previous.narration });
    } else {
      try {
        localStorage.setItem(muteStash, JSON.stringify({ sound: settings.sound, narration: settings.narration }));
      } catch {}
      window.speechSynthesis?.cancel();
      writeSettings({ sound: false, narration: false });
    }
    paintAudio();
  });

  soundBox.addEventListener('change', () => {
    writeSettings({ sound: soundBox.checked });
    paintAudio();
  });
  narrationBox.addEventListener('change', () => {
    writeSettings({ narration: narrationBox.checked });
    paintAudio();
  });
  qualityBox.addEventListener('change', () => {
    writeSettings({ quality: qualityBox.value });
    paintAudio();
  });
  paintAudio();

  /* ---------- which build is this? ---------- */
  const stamp = document.getElementById('build-stamp');
  if (stamp) stamp.textContent = 'build ' + __BUILD__;

  /* ---------- dialogs ---------- */
  const board = document.getElementById('board');
  const settings = document.getElementById('settings');
  const entry = document.getElementById('entry');

  document.getElementById('board-btn').addEventListener('click', () => {
    if (!board.open) board.showModal();
    load();
    startPolling();
  });
  document.getElementById('board-close').addEventListener('click', () => board.close());
  board.addEventListener('close', () => stopPolling());
  board.addEventListener('click', (event) => {
    if (event.target === board) board.close();
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    if (!settings.open) settings.showModal();
  });
  document.getElementById('settings-close').addEventListener('click', () => settings.close());
  settings.addEventListener('click', (event) => {
    if (event.target === settings) settings.close();
  });

  /* ---------- entry: team code, then straight into the game ---------- */
  const codeInput = document.getElementById('team-code');
  const codeError = document.getElementById('entry-error');
  const beginBtn = document.getElementById('begin-btn');
  let session = null;
  let codeLogin = false;
  // Enter must not act before /api/auth/config answers, or a quick click races
  // the request and bounces through /play/ for no reason.
  let configKnown = false;
  let markConfigKnown = () => {};
  const configReady = new Promise((resolve) => { markConfigKnown = resolve; });

  const AUTH_ERRORS = {
    google_not_configured: 'Google sign-in is not configured on this deployment.',
    google_denied: 'Google sign-in was cancelled.',
    state: 'That sign-in attempt expired — try again.',
    token: 'Google sign-in failed while signing you in.',
    profile: 'Google sign-in failed while reading your profile.',
    network: 'The sign-in service could not be reached.',
  };
  const authError = new URLSearchParams(window.location.search).get('auth_error');

  const openEntry = (message = '') => {
    codeError.textContent = message;
    if (!entry.open) entry.showModal();
    codeInput.focus();
  };

  const closeEntry = () => entry.close();

  enter.addEventListener('click', async () => {
    if (session) {
      window.location.assign(GAME);
      return;
    }
    if (!configKnown) await configReady;
    if (codeLogin) openEntry();
    else window.location.assign('/play/');
  });

  document.getElementById('entry-close').addEventListener('click', closeEntry);
  entry.addEventListener('click', (event) => {
    if (event.target === entry) closeEntry();
  });

  const begin = async () => {
    const code = codeInput.value.trim();
    if (!code) {
      codeError.textContent = 'Type the code from your table card.';
      return;
    }
    beginBtn.disabled = true;
    beginBtn.textContent = 'Opening your case…';
    codeError.textContent = '';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        // A team-code sign-in is always the campaign save; a stale practice marker from the
        // chapter picker would make every later request look for the practice cookie.
        try {
          localStorage.setItem('moon-mode', 'campaign');
        } catch {}
        window.location.assign(GAME);
        return;
      }
      codeError.textContent =
        res.status === 401 ? 'Wrong code. Check the label on your table.' : 'Sign-in failed. Try again.';
    } catch {
      codeError.textContent = 'The case server is unavailable. Try again in a moment.';
    }
    beginBtn.disabled = false;
    beginBtn.textContent = 'Begin →';
  };

  document.getElementById('entry-form').addEventListener('submit', (event) => {
    event.preventDefault();
    begin();
  });

  /* ---------- what this deployment offers ---------- */
  fetch('/api/auth/config', { headers: { accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((config) => {
      if (config) codeLogin = !!config.devLogin;
      // A Google round-trip that failed bounces here from /play/ — say why, in the dialog.
      if (authError && codeLogin) openEntry(AUTH_ERRORS[authError] ?? 'Sign-in failed. Try again.');
    })
    .catch(() => {})
    .finally(() => {
      configKnown = true;
      markConfigKnown();
    });

  fetch('/api/state', { headers: { accept: 'application/json' } })
    .then(async (res) => {
      if (!res.ok) {
        if (res.status === 401) enter.textContent = 'Sign in to play';
        return;
      }
      const state = await res.json();
      session = state.team ?? null;
      enter.textContent = 'Continue your case file';
      render();
    })
    .catch(() => {});

  /* ---------- live leaderboard ---------- */
  const tbody = document.getElementById('board-body');
  const status = document.getElementById('board-status');
  let poll = null;
  let tick = null;
  let snapshot = null;

  const fmtClock = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return hours ? hours + ':' + minutes + ':' + secs : minutes + ':' + secs;
  };

  const fmtWall = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value);
    const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(text.includes('T') ? text : text.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const elapsedFor = (team) => {
    if (!snapshot || team.act === 'act0' || !team.started_at) return null;
    const drift = team.solved ? 0 : Math.max(0, (Date.now() - snapshot.received) / 1000);
    return Math.max(0, (team.elapsedSeconds ?? 0) + drift);
  };

  const cell = (text, className) => {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  };

  const paintTimes = () => {
    if (!snapshot) return;
    [...tbody.rows].forEach((row, index) => {
      const team = snapshot.teams[index];
      const timeBox = row.querySelector('.timer');
      if (!team || !timeBox) return;
      const elapsed = elapsedFor(team);
      timeBox.textContent = elapsed === null ? 'Not started' : fmtClock(elapsed);
    });
  };

  const render = () => {
    if (!snapshot) return;
    tbody.replaceChildren();
    if (!snapshot.teams.length) {
      const row = document.createElement('tr');
      row.className = 'board__empty';
      const td = document.createElement('td');
      td.colSpan = 7;
      td.textContent = 'No team has entered yet.';
      row.append(td);
      tbody.append(row);
      return;
    }
    snapshot.teams.forEach((team, index) => {
      const row = document.createElement('tr');
      if (session && team.name === session) row.className = 'you';
      if (index === 0) row.classList.add('leader');

      row.append(cell(String(index + 1)));
      row.append(cell(team.name || 'unnamed team'));
      row.append(cell(team.solved ? 'Case complete' : team.act === 'act0' ? 'Prologue' : (team.actTitle ?? team.act), 'progress'));
      row.append(cell(String(team.clues_found ?? 0), 'count'));
      row.append(cell(String(team.puzzles_solved ?? 0), 'count'));

      const elapsed = elapsedFor(team);
      row.append(cell(elapsed === null ? 'Not started' : fmtClock(elapsed), 'timer'));

      const solvedAt = team.solved ? fmtWall(team.solved_at) : null;
      if (solvedAt) row.append(cell('\u2713 ' + solvedAt, 'solved'));
      else {
        const td = cell('in progress', 'muted-cell');
        row.append(td);
      }
      tbody.append(row);
    });
  };

  const load = async () => {
    try {
      const res = await fetch('/api/leaderboard', { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      snapshot = { teams: Array.isArray(data.teams) ? data.teams : [], received: Date.now() };
      render();
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      status.textContent = snapshot.teams.length + ' team' + (snapshot.teams.length === 1 ? '' : 's') + ' in play · updated ' + stamp;
    } catch {
      status.textContent = 'Leaderboard unavailable — reconnecting.';
    }
  };

  const startPolling = () => {
    clearInterval(poll);
    clearInterval(tick);
    poll = setInterval(load, REFRESH_MS);
    tick = setInterval(paintTimes, 1000);
  };

  const stopPolling = () => {
    clearInterval(poll);
    clearInterval(tick);
    poll = null;
    tick = null;
  };
})();
