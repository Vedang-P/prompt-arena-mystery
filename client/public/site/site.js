/* Prompt Arena: Mystery — title screen behaviour.
   Cinematic entry card, session-aware label, live leaderboard dialog. */

(() => {
  const root = document.documentElement;
  const enter = document.getElementById('enter');
  const boardBtn = document.getElementById('board-btn');
  const dlg = document.getElementById('board');
  const closeBtn = document.getElementById('board-close');
  const tbody = document.getElementById('board-body');
  const status = document.getElementById('board-status');
  const INTRO_MS = 2600;
  const REFRESH_MS = 5000;
  let poll = null;

  /* ---- the card plays, or is dismissed by a click / key ---- */
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

  /* ---- label the entry button for the current session ---- */
  fetch('/api/state', { headers: { accept: 'application/json' } })
    .then((res) => {
      if (res.ok) enter.textContent = 'Continue your case file';
      else if (res.status === 401) enter.textContent = 'Sign in to play';
    })
    .catch(() => {});

  /* ---- live leaderboard ---- */
  const fmtTime = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const cell = (text, className) => {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  };

  const render = (teams) => {
    tbody.replaceChildren();
    if (!teams.length) {
      const row = document.createElement('tr');
      row.className = 'board__empty';
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'No team has opened the case yet.';
      row.append(td);
      tbody.append(row);
      return;
    }
    teams.forEach((team, index) => {
      const row = document.createElement('tr');
      row.append(cell(String(index + 1)));
      row.append(cell(team.name || 'unnamed team'));
      row.append(cell(team.solved ? 'solved ' + fmtTime(team.solved_at) : '—', team.solved ? 'solved' : null));
      row.append(cell(String(team.clues_found ?? 0)));
      row.append(cell(String(team.puzzles_solved ?? 0)));
      row.append(cell(String(team.hints_used ?? 0)));
      tbody.append(row);
    });
  };

  const load = async () => {
    try {
      const res = await fetch('/api/leaderboard', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      const teams = Array.isArray(data.teams) ? data.teams : [];
      render(teams);
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      status.textContent = teams.length + ' team' + (teams.length === 1 ? '' : 's') + ' · updated ' + stamp;
    } catch (error) {
      status.textContent = 'Leaderboard unavailable — retrying.';
    }
  };

  const stop = () => {
    clearInterval(poll);
    poll = null;
  };

  boardBtn.addEventListener('click', () => {
    if (!dlg.open) dlg.showModal();
    load();
    stop();
    poll = setInterval(load, REFRESH_MS);
  });

  closeBtn.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', stop);
  dlg.addEventListener('click', (event) => {
    if (event.target === dlg) dlg.close();
  });
})();
