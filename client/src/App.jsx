import { lazy, useEffect, useMemo, useRef, useState } from 'react';
const Scene = lazy(() => import('./Scene.jsx'));
import TitleScreen, { ChapterSelect, EvidenceCard } from './TitleScreen.jsx';
const CinematicStory = lazy(() => import('./CinematicStory.jsx'));
import { SettingsPanel } from './Settings.jsx';
import Soundtrack from './Soundtrack.jsx';
import Leaderboard from './Leaderboard.jsx';
const ActDirector = lazy(() => import('./ActDirector.jsx'));
import LogoutButton from './LogoutButton.jsx';
import FullscreenGate, { DisqualifiedScreen, tryEnterFullscreen } from './FullscreenGate.jsx';
import {
  AccuseModal,
  DialogueOverlay,
  EndingCard,
  Notebook,
  Notice,
  PuzzleModal,
  RestartConfirm,
} from './Panels.jsx';
import {
  accuse,
  completeAct,
  devLogin,
  discoverClue,
  getAuthConfig,
  getHistory,
  getState,
  heartbeat,
  interrogate,
  restartRun,
  solvePuzzle,
  startGuest,
  startPractice,
} from './api.js';

const AUTH_ERROR_TEXT = {
  google_not_configured: 'Google sign-in is not configured on this deployment yet.',
  google_denied: 'Google sign-in was cancelled.',
  state: 'The sign-in attempt expired — try again.',
  token: 'Google sign-in failed while exchanging the code.',
  profile: 'Google sign-in failed while reading your profile.',
  network: 'Google sign-in failed — network trouble.',
};

function mergeUnlocked(existing, added) {
  const seen = new Set(existing.map((f) => f.fact));
  return [...existing, ...added.filter((f) => !seen.has(f.fact))];
}

function mergeIds(existing, added) {
  const seen = new Set(existing);
  return [...existing, ...added.filter((id) => !seen.has(id))];
}

export default function App() {
  const [phase, setPhase] = useState('loading');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [leaderboardOpen,setLeaderboardOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [evidence, setEvidence] = useState(null);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { setSettingsOpen(false); setChaptersOpen(false); setLeaderboardOpen(false); setEvidence(null); setNotebookOpen(false); setPuzzleSpot(null); setActiveChar(null); setExploreOpen(false); setAccuseOpen(false); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => () => clearTimeout(accuseTimer.current), []);
  const [state, setState] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [activeChar, setActiveChar] = useState(null);
  const [chats, setChats] = useState({});
  const [typing, setTyping] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [accuseOpen, setAccuseOpen] = useState(false);
  const [accuseResult, setAccuseResult] = useState(null);
  const [accuseBusy, setAccuseBusy] = useState(false);
  const [loginError, setLoginError] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('auth_error');
    return code ? AUTH_ERROR_TEXT[code] ?? 'Sign-in failed.' : null;
  });
  const [loginBusy, setLoginBusy] = useState(false);
  const [authConfig, setAuthConfig] = useState(null);
  const [won, setWon] = useState(null);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [actBusy, setActBusy] = useState(false);
  const [puzzleSpot, setPuzzleSpot] = useState(null);
  const [puzzleResult, setPuzzleResult] = useState(null);
  const [puzzleBusy, setPuzzleBusy] = useState(false);
  const [story, setStory] = useState(null);
  const [staleBuild, setStaleBuild] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [dqInfo, setDqInfo] = useState(null);
  const [dismissedAnn, setDismissedAnn] = useState(null);
  const accuseTimer = useRef(null);
  const puzzleRequest = useRef(null);

  // Dev/testing shortcuts: ?beat=<id> replays the cinematic from that beat, even
  // after the act is complete; ?puzzle=<id> opens that puzzle's modal once on
  // load; ?room=<id> preselects a room when it belongs to the current act.
  const devParams = useMemo(() => new URLSearchParams(import.meta.env.DEV ? window.location.search : ''), []);
  const devBeat = useMemo(() => devParams.get('beat'), [devParams]);
  const devPuzzle = useMemo(() => devParams.get('puzzle'), [devParams]);
  const devRoom = useMemo(() => devParams.get('room'), [devParams]);
  const devPuzzleOpened = useRef(false);

  const currentAct = useMemo(
    () => state?.acts?.find((a) => a.id === state.act) ?? state?.acts?.[0] ?? null,
    [state]
  );

  const actRooms = useMemo(() => {
    if (!state) return [];
    const ids = currentAct?.rooms?.length
      ? currentAct.rooms
      : state.rooms.map((r) => r.id);
    return ids.map((id) => state.rooms.find((r) => r.id === id)).filter(Boolean);
  }, [state, currentAct]);

  // Room tabs must not bypass the story: a room opens only when it is the
  // act's entry room, has been visited, or a visible travel hotspot leads there
  // with its requirements met.
  const [visitedRooms, setVisitedRooms] = useState(() => new Set());
  useEffect(() => { setVisitedRooms(new Set()); }, [currentAct?.id]);
  useEffect(() => {
    if (!roomId) return;
    setVisitedRooms((prev) => (prev.has(roomId) ? prev : new Set(prev).add(roomId)));
  }, [roomId]);

  const characterNames = useMemo(
    () => Object.fromEntries((state?.characters ?? []).map((c) => [c.id, c.name])),
    [state]
  );

  const clueLabels = useMemo(() => {
    const labels = {};
    for (const clue of state?.clues ?? []) {
      if (clue?.id) labels[clue.id] = clue.name ?? clue.id;
    }
    for (const room of state?.rooms ?? []) {
      for (const h of room.hotspots ?? []) {
        if (h.type === 'clue' && h.clue && !labels[h.clue]) labels[h.clue] = h.label;
      }
    }
    return labels;
  }, [state]);

  // Hotspots whose requires are unmet stay hidden so later-act content can't be
  // teased early. Rooms themselves remain in the tab list; only hotspots filter.
  const displayRooms = useMemo(() => {
    if (!state) return [];
    const discovered = new Set(state.discovered ?? []);
    const solved = new Set(state.solvedPuzzles ?? []);
    const actIndex = new Map((state.acts ?? []).map((a, i) => [a.id, i]));
    const currentIndex = actIndex.get(state.act) ?? 0;
    const available = (h) => {
      if (h.act && h.act !== state.act) return false;
      const ownReq = h.type === 'puzzle' ? state.puzzles?.find((p) => p.id === h.puzzle)?.requires : null;
      if ((ownReq?.clues ?? []).some((id) => !discovered.has(id)) || (ownReq?.puzzles ?? []).some((id) => !solved.has(id))) return false;
      const clueReq = h.type === 'clue' ? state.clues?.find((c) => c.id === h.clue)?.requires : null;
      if ((clueReq ?? []).some((id) => !discovered.has(id))) return false;
      const req = h.requires;
      if (!req) return true;
      if ((req.clues ?? []).some((c) => !discovered.has(c))) return false;
      if ((req.puzzles ?? []).some((p) => !solved.has(p))) return false;
      return true;
    };
    return state.rooms.map((room) => ({
      ...room,
      hotspots: (room.hotspots ?? []).filter(available),
    }));
  }, [state]);

  const displayState = useMemo(() => ({ ...state, rooms: displayRooms }), [state, displayRooms]);

  // Room tabs must not bypass the story: a room opens only when it is the
  // act's entry room, has been visited, or a visible travel hotspot leads there
  // with its requirements met.
  const reachableRooms = useMemo(() => {
    if (!state) return new Set();
    const reachable = new Set();
    if (currentAct?.entry_room) reachable.add(currentAct.entry_room);
    for (const id of visitedRooms) reachable.add(id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of displayRooms) {
        if (!reachable.has(r.id)) continue;
        for (const h of r.hotspots ?? []) {
          if (h.type !== 'travel' || !h.to || reachable.has(h.to)) continue;
          if (!actRooms.some((room) => room.id === h.to)) continue;
          reachable.add(h.to);
          grew = true;
        }
      }
    }
    return reachable;
  }, [state, currentAct, visitedRooms, displayRooms, actRooms]);

  useEffect(() => {
    if (currentAct?.entry_room) setRoomId(currentAct.entry_room);
  }, [currentAct?.id]);

  const activePuzzle = useMemo(() => {
    if (!puzzleSpot || !state) return null;
    return (
      state.puzzles?.find((p) => p.id === puzzleSpot.puzzle) ?? {
        id: puzzleSpot.puzzle,
        kind: 'text',
        prompt: puzzleSpot.label,
      }
    );
  }, [state, puzzleSpot]);

  const ending = state?.ending
    ? typeof state.ending === 'string'
      ? { id: state.ending }
      : state.ending
    : null;

  const score =
    state?.score ??
    (state
      ? state.discovered.length + (state.solvedPuzzles?.length ?? 0) - (state.penalties ?? 0)
      : 0);

  // The server's canAdvance is the source of truth, but a failed refresh after
  // the last required clue must not leave the Continue button missing forever:
  // the same gate can be derived locally from the act's own requirements.
  const advanceReady = useMemo(() => {
    if (state?.canAdvance?.ok) return true;
    const complete = currentAct?.complete;
    if (!state || !currentAct || !complete) return false;
    const discovered = new Set(state.discovered ?? []);
    const solved = new Set(state.solvedPuzzles ?? []);
    return (complete.clues ?? []).every((c) => discovered.has(c)) && (complete.puzzles ?? []).every((p) => solved.has(p));
  }, [state, currentAct]);

  const finishAct = async (actId) => {
    if (actBusy) return;
    setActBusy(true);
    try {
      const res = await completeAct(actId);
      const fresh = await getState();
      setState(fresh);
      setActiveChar(null); setPuzzleSpot(null); setEvidence(null); setExploreOpen(false);
      if (res.ending) setPhase('solved');
      const url = new URL(window.location.href); url.searchParams.delete('beat'); window.history.replaceState(null, '', url);
    } catch (e) {
      setNotice({ kicker: 'Case saved', title: e.status === 409 ? 'Keep investigating' : 'Connection interrupted', body: e.status === 409 ? 'Collect the remaining evidence before advancing.' : 'Your case has not advanced. Please try again.' });
    } finally { setActBusy(false); }
  };

  const clearNextIntro = (actId) => {
    const acts = state?.acts ?? [];
    const idx = acts.findIndex((a) => a.id === actId);
    const next = acts.slice(idx + 1).find((a) => a.type === 'interactive');
    if (next) sessionStorage.removeItem(`pa-intro-${next.id}`);
  };

  const loadGame = async (destination = 'menu') => {
    try {
      let data;
      try {
        data = await getState();
      } catch (first) {
        // A stale practice marker (chapter picker) makes the client ask for the practice
        // session; if that cookie is gone, fall back to the campaign session once.
        const stale = first?.status === 401 && (() => { try { return localStorage.getItem('moon-mode') === 'practice'; } catch { return false; } })();
        if (!stale) throw first;
        try {
          localStorage.setItem('moon-mode', 'campaign');
        } catch {}
        data = await getState();
      }
      setState(data);
      setDqInfo(null);
      const act = data.acts?.find((a) => a.id === data.act);
      const actRoomIds = act?.rooms?.length ? act.rooms : data.rooms.map((r) => r.id);
      const entry =
        (devRoom && actRoomIds.includes(devRoom) ? devRoom : null) ??
        act?.entry_room ??
        act?.rooms?.[0] ??
        data.rooms[0]?.id;
      setRoomId((prev) => prev ?? entry);
      setPhase(destination === 'menu' ? 'menu' : data.solved ? 'solved' : 'game');
      return true;
    } catch (e) {
      if (e.status === 403 && e.data?.error === 'disqualified') {
        setDqInfo(e.data);
        setPhase('disqualified');
        // Handled, not "no session": the disqualification screen explains the
        // block, so the boot path must never bounce back to the title card.
        return 'disqualified';
      } else if (e.status === 401) setPhase('login');
      else {
        // A server/network failure is not "no session": stay on the sign-in
        // screen and show the error instead of bouncing to the landing page.
        setLoginError('The case server is unavailable. Try again in a moment.');
        setPhase('login');
        return 'error';
      }
      return false;
    }
  };

  // Silent refresh after progress mutations so derived server fields (notably
  // canAdvance) stay in sync without a full reload or loading UI.
  const refreshState = async () => {
    try {
      const fresh = await getState();
      setState((s) => ({ ...s, ...fresh }));
    } catch {
      // Keep the optimistic view; the next explicit load will reconcile.
    }
  };

  const handleDisqualified = (info) => {
    setDqInfo(info ?? {});
    setPhase('disqualified');
  };

  // A dead session surfaces from anywhere (a clue click, a puzzle submit, a
  // heartbeat): one listener clears the stale save and returns to sign-in.
  useEffect(() => {
    const onExpired = () => {
      setState(null);
      setDqInfo(null);
      setLoginError('Your session ended — sign in again to continue.');
      setPhase('login');
    };
    window.addEventListener('pa-session-expired', onExpired);
    return () => window.removeEventListener('pa-session-expired', onExpired);
  }, []);

  // Presence + enforcement ping while the team is in play. It also notices an
  // admin-side disqualification (or a requalification) without a reload.
  useEffect(() => {
    if (!state || phase !== 'game') return;
    let alive = true;
    const ping = async () => {
      if (document.hidden) return;
      try {
        const res = await heartbeat(Boolean(document.fullscreenElement));
        if (!alive || !res) return;
        setState((s) => {
          if (!s) return s;
          const strikesChanged = res.strikes != null && s.strikes !== res.strikes;
          const nextAnn = res.announcement ?? null;
          const annChanged =
            (s.announcement?.id ?? null) !== (nextAnn?.id ?? null) ||
            (s.announcement?.text ?? '') !== (nextAnn?.text ?? '') ||
            (s.announcement?.level ?? null) !== (nextAnn?.level ?? null);
          if (!strikesChanged && !annChanged) return s;
          return { ...s, strikes: res.strikes ?? s.strikes, announcement: nextAnn };
        });
      } catch (e) {
        if (alive && e.status === 403 && e.data?.error === 'disqualified') handleDisqualified(e.data);
      }
    };
    const timer = setInterval(ping, 15000);
    ping();
    return () => { alive = false; clearInterval(timer); };
  }, [state?.team, phase]);

  useEffect(() => {
    // The cinematic title card is the only landing page: /play/ never shows a menu when a
    // team code (or event mode) is how players sign in — no session bounces back to `/`, a
    // session drops straight into the current act.
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    (async () => {
      const config = await getAuthConfig().catch(() => ({ google: false, devLogin: false, eventMode: false }));
      setAuthConfig(config);
      const codeIsTheWay = Boolean(config.devLogin || config.eventMode || !config.google);
      const entered = await loadGame(codeIsTheWay ? 'game' : 'menu');
      const url = new URL(window.location.href);
      if (url.searchParams.has('resume')) {
        url.searchParams.delete('resume');
        window.history.replaceState(null, '', url);
      }
      if (entered === false && codeIsTheWay) {
        window.location.replace(authError ? '/?auth_error=' + encodeURIComponent(authError) : '/');
      }
    })();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  // An open tab keeps running its old bundle after a deploy; compare the
  // running build with the server's and offer a refresh instead of letting
  // players judge fixes they have not actually received.
  useEffect(() => {
    let alive = true;
    let timer = null;
    const check = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (alive && data.build && !String(__BUILD__).includes(data.build)) setStaleBuild(true);
      } catch {}
    };
    check();
    timer = setInterval(check, 5 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Keep the active room inside the current act's tab list.
  useEffect(() => {
    if (!state || !actRooms.length) return;
    if (actRooms.some((r) => r.id === roomId)) return;
    const entry = currentAct?.entry_room;
    setRoomId(entry && actRooms.some((r) => r.id === entry) ? entry : actRooms[0].id);
  }, [state, actRooms, roomId, currentAct]);

  // Play each interactive act's intro once per session, before its first room view.
  useEffect(() => {
    if (!state || !currentAct || phase !== 'game' || story || state.ending || devBeat || devPuzzle)
      return;
    if (currentAct.type !== 'interactive' || !currentAct.intro?.length) return;
    const key = `pa-intro-${currentAct.id}`;
    if (sessionStorage.getItem(key)) return;
    setStory({
      key,
      after: 'intro',
      actId: currentAct.id,
      lines: currentAct.intro,
      kicker: currentAct.kicker,
      title: currentAct.title,
      backdrop: currentAct.backdrop,
      doneLabel: 'Begin',
    });
  }, [state, currentAct, phase, story, devBeat, devPuzzle]);

  // Dev/testing: ?puzzle=<id> opens the puzzle modal once, straight from the URL.
  // Closing it leaves the game view; later state updates never reopen it.
  useEffect(() => {
    if (!devPuzzle || devPuzzleOpened.current || devBeat) return;
    if (!state || phase !== 'game' || state.ending) return;
    if (!state.puzzles?.some((p) => p.id === devPuzzle)) return;
    devPuzzleOpened.current = true;
    openPuzzle(devPuzzle);
  }, [devPuzzle, devBeat, state, phase]);

  const completeStory = () => {
    if (!story) return;
    const current = story;
    // A scene puzzle is the story: finishing (or skipping) it records the lead
    // and returns to the room — it never ends the act.
    if (current.after === 'scene') {
      finishScene(current.puzzleId);
      return;
    }
    setStory(null);
    if (current.after === 'intro') {
      sessionStorage.setItem(current.key, '1');
      return;
    }
    clearNextIntro(current.actId);
    finishAct(current.actId);
  };

  // Closing an intro without finishing it must still count as seen: switching
  // acts (chapter pick, login, restart) nulls the story while the old act's
  // state is still current, and without the mark the intro effect re-opens the
  // old act's intro over the new one — the new act's intro then never plays.
  const closeStory = () => {
    if (story?.after === 'intro' && story.key) {
      try { sessionStorage.setItem(story.key, '1'); } catch {}
    }
    setStory(null);
  };

  const advanceAct = () => {
    if (!currentAct || !advanceReady || actBusy || story) return;
    if (currentAct.outro?.length) {
      setStory({
        key: `pa-outro-${currentAct.id}`,
        after: 'outro',
        actId: currentAct.id,
        lines: currentAct.outro,
        kicker: currentAct.kicker,
        title: currentAct.title,
        backdrop: currentAct.backdrop,
        doneLabel: 'Continue',
      });
    } else {
      clearNextIntro(currentAct.id);
      finishAct(currentAct.id);
    }
  };

  // A scene puzzle is not a question: its modal is the story overlay, and
  // finishing it records the lead.
  const openScene = (puzzleId, label) => {
    const puzzle = state.puzzles?.find((p) => p.id === puzzleId);
    if (!puzzle?.lines?.length) return false;
    // A scene plays in the room its hotspot stands in, not always the act's
    // entry room: the burning office is not the ward it started in.
    const sceneRoom = state.rooms.find((r) => (r.hotspots ?? []).some((h) => h.type === 'puzzle' && h.puzzle === puzzleId));
    puzzleRequest.current = null;
    setPuzzleSpot(null);
    setPuzzleResult(null);
    setStory({
      key: `pa-scene-${puzzleId}`,
      after: 'scene',
      actId: currentAct?.id,
      puzzleId,
      lines: puzzle.lines,
      kicker: currentAct?.kicker,
      title: label ?? currentAct?.title,
      doneLabel: 'Continue',
      backdrop: sceneRoom?.id ?? currentAct?.entry_room,
      cast: [{ character: 'sameer' }],
    });
    return true;
  };

  const openPuzzle = (target) => {
    const id = typeof target === 'string' ? target : target?.puzzle;
    if (!id) return;
    setNotebookOpen(false);
    const placement = state.rooms.flatMap(r => r.hotspots).find(h => h.puzzle === id);
    if (state.puzzles?.find((p) => p.id === id)?.kind === 'scene') {
      openScene(id, typeof target === 'object' ? target.label : placement?.label);
      return;
    }
    puzzleRequest.current = null;
    setPuzzleSpot(typeof target === 'string' ? { puzzle: id, label: placement?.label ?? 'Examine the clue' } : target);
    setPuzzleResult(null);
  };

  const closePuzzle = () => {
    puzzleRequest.current = null;
    setPuzzleSpot(null);
    setPuzzleResult(null);
  };

  // Submitting any puzzle (a guess or a finished scene) funnels through here:
  // the verdict belongs to the puzzle that was submitted, so closing this modal
  // and opening another one must not paint A's result inside B.
  const applySolve = async (puzzleId, answer) => {
    puzzleRequest.current = puzzleId;
    setPuzzleBusy(true);
    setPuzzleResult(null);
    let recorded = false;
    try {
      const res = await solvePuzzle(puzzleId, answer);
      if (puzzleRequest.current !== puzzleId) return false;
      setPuzzleResult(res);
      setState((s) => {
        const next = {
          ...s,
          discovered: res.discovered ?? mergeIds(s.discovered, res.grants ?? []),
          solvedPuzzles: res.solvedPuzzles ?? s.solvedPuzzles ?? [],
          penalties: res.totalPenalties ?? (s.penalties ?? 0) + (res.penalty ?? 0),
          unlocked: mergeUnlocked(s.unlocked, res.newlyUnlocked ?? []),
        };
        if (res.ending) {
          next.ending = typeof res.ending === 'string' ? { id: res.ending } : res.ending;
        }
        return next;
      });
      // Reconcile derived server state (canAdvance) without a page reload.
      refreshState();
      recorded = true;
    } catch (e) {
      if (puzzleRequest.current !== puzzleId) return false;
      if (e.status === 403) {
        setPuzzleResult({ correct: false, message: 'This lead is locked. Inspect the other evidence first.', penalty: 0 });
      } else if (e.status === 404) {
        setNotice({ kicker: 'Missing', title: 'Dead end', body: 'That line of inquiry is not available.' });
        closePuzzle();
      } else {
        setPuzzleResult({ correct: false, message: 'The line went dead. Try again.', penalty: 0 });
      }
    } finally {
      // closePuzzle may have released the request; only a newer request that
      // took over the slot may keep the busy flag.
      if (puzzleRequest.current === puzzleId || puzzleRequest.current === null) setPuzzleBusy(false);
    }
    return recorded;
  };

  const handleSolve = (answer) => {
    if (activePuzzle) applySolve(activePuzzle.id, answer);
  };

  // When a scene's last line (or its skip button) lands, record the lead and
  // return to the room; the act itself continues.
  const finishScene = async (puzzleId) => {
    const recorded = await applySolve(puzzleId, 'scene');
    if (recorded) setStory(null);
    else setNotice({ kicker: 'Case saved', title: 'Could not record the scene', body: 'Check your connection and try again.' });
  };

  const handleDevLogin = async (code) => {
    if (authConfig?.fullscreen) tryEnterFullscreen();
    setLoginBusy(true);
    setLoginError(null);
    try {
      localStorage.setItem('moon-mode','campaign');
      await devLogin(code);
      clearIntros(); closeStory(); setRoomId(null); setChats({}); setActiveChar(null); setEvidence(null); setPuzzleSpot(null);
      await loadGame('game');
    } catch (e) {
      setLoginError(e.status === 401 ? 'Wrong code. Check the label on your table.' : 'Sign-in failed.');
    } finally {
      setLoginBusy(false);
    }
  };

  const openCharacter = async (hotspot) => {
    setChatError(null);
    setNotebookOpen(false);
    setActiveChar(hotspot.character);
    if (!chats[hotspot.character]) {
      try {
        const { messages } = await getHistory(hotspot.character);
        setChats((prev) => ({ ...prev, [hotspot.character]: messages }));
      } catch {
        setChats((prev) => ({ ...prev, [hotspot.character]: [] }));
      }
    }
  };

  const ask = async (text) => {
    if (!activeChar || typing) return;
    const character = activeChar;
    setChatError(null);
    setTyping(true);
    setChats((prev) => ({
      ...prev,
      [character]: [...(prev[character] ?? []), { role: 'player', content: text }, { role: 'npc', content: '' }],
    }));
    const reqId = crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2);
    try {
      await interrogate(character, text, {
        reqId,
        onDelta: (delta) =>
          setChats((prev) => {
            const list = [...(prev[character] ?? [])];
            const last = { ...list[list.length - 1] };
            last.content += delta;
            list[list.length - 1] = last;
            return { ...prev, [character]: list };
          }),
        onReset: (full) =>
          setChats((prev) => {
            const list = [...(prev[character] ?? [])];
            const last = list[list.length - 1];
            if (last && last.role === 'npc') {
              list[list.length - 1] = { ...last, content: full };
              return { ...prev, [character]: list };
            }
            return prev;
          }),
      });
    } catch (e) {
      setChatError(e.status === 429 ? 'Give them a moment to breathe.' : 'The line went dead. Try again.');
      // Unblock the composer immediately — the reconcile below is best-effort
      // and must never hold the input hostage behind its own timeout.
      setTyping(false);
      // The server may have finished and stored the reply after the client gave up
      // (failover can outlast the browser timeout), so reconcile with the transcript.
      try {
        const stored = await getHistory(character, 6000);
        if (Array.isArray(stored.messages) && stored.messages.length) {
          setChats((prev) => ({ ...prev, [character]: stored.messages }));
        }
      } catch {}
      setChats((prev) => {
        const list = [...(prev[character] ?? [])];
        if (list.length && list[list.length - 1].role === 'npc' && !list[list.length - 1].content) {
          list[list.length - 1] = { role: 'npc', content: '(…the conversation stalls.)' };
        }
        return { ...prev, [character]: list };
      });
    } finally {
      // Never leave an empty bubble behind, whatever the stream did.
      setChats((prev) => {
        const list = (prev[character] ?? []).map((m) =>
          m.role === 'npc' && !m.content ? { ...m, content: '(…the conversation stalls.)' } : m
        );
        return { ...prev, [character]: list };
      });
      setTyping(false);
    }
  };

  const findClue = async (hotspot) => {
    try {
      const res = await discoverClue(hotspot.clue);
      setState((s) => ({
        ...s,
        discovered: res.discovered,
        unlocked: mergeUnlocked(s.unlocked, res.newlyUnlocked ?? []),
      }));
      setEvidence(res.clue);
      setNotice({
        kicker: 'Evidence logged',
        title: res.clue.name,
        body: res.clue.description,
        page: res.clue.page,
        facts: res.newlyUnlocked,
      });
      // Reconcile derived server state (canAdvance) without a page reload.
      refreshState();
    } catch (e) {
      if (e.status === 409) {
        setNotice({ kicker: 'Sealed', title: 'Locked', body: 'Something else has to come first.' });
      } else if (e.status !== 401) {
        // Never swallow a failed discovery: the hotspot would just look dead.
        setNotice({
          kicker: 'Evidence',
          title: 'Could not log that clue',
          body: e.status === 429 ? 'Give it a moment, then try again.' : 'Check your connection and try again.',
        });
      }
    }
  };

  const submitAccusation = async (payload) => {
    setAccuseBusy(true);
    try {
      const res = await accuse(payload);
      setAccuseResult({ ...res, payload });
      if (res.correct) {
        setState((s) => ({ ...s, solved: true }));
        clearTimeout(accuseTimer.current);
        accuseTimer.current = setTimeout(() => {
          setAccuseOpen(false);
          setWon(payload);
          setPhase('solved');
        }, 1800);
      }
    } catch {
      setAccuseResult({ stage: 'conclusion', correct: false, checks: null, message: 'Connection interrupted. Try again.' });
    } finally {
      setAccuseBusy(false);
    }
  };

  const activeCharacter = useMemo(
    () => state?.characters.find((c) => c.id === activeChar) ?? null,
    [state, activeChar]
  );

  const focusHotspot = useMemo(() => {
    if (!displayRooms.length || !activeChar) return null;
    for (const r of displayRooms) {
      for (const h of r.hotspots) {
        if (h.type === 'character' && h.character === activeChar) return h;
      }
    }
    return null;
  }, [displayRooms, activeChar]);

  const room = state?.rooms.find((r) => r.id === roomId) ?? actRooms[0] ?? state?.rooms?.[0];

  const nextActFor = (act) => {
    if (!act) return null;
    const acts = state?.acts ?? [];
    const idx = acts.findIndex((a) => a.id === act.id);
    return idx === -1 ? null : acts[idx + 1] ?? null;
  };

  const clearIntros = () => { for (let i = 0; i < 9; i++) sessionStorage.removeItem('pa-intro-act' + i); };
  const beginGuest = async () => {
    setLoginBusy(true); setLoginError(null);
    try {
      localStorage.setItem('moon-mode', 'campaign'); await startGuest();
      clearIntros(); closeStory(); setRoomId(null); setChats({}); setNotice(null); setActiveChar(null); setEvidence(null); setPuzzleSpot(null);
      await loadGame('game');
    } catch { setLoginError('Could not open the case. Please try again.'); }
    finally { setLoginBusy(false); }
  };
  const beginPractice = async (actId) => {
    setLoginBusy(true);
    try {
      await startPractice(actId); localStorage.setItem('moon-mode', 'practice'); clearIntros();
      setChaptersOpen(false); closeStory(); setRoomId(null); setChats({}); setEvidence(null); setActiveChar(null); setPuzzleSpot(null);
      await loadGame('game');
    } catch { setNotice({ title: 'Chapter unavailable', body: 'Please try again.' }); }
    finally { setLoginBusy(false); }
  };
  const returnCampaign = async () => {
    localStorage.setItem('moon-mode', 'campaign'); setChaptersOpen(false); closeStory(); setRoomId(null); setChats({});
    await loadGame('game');
  };
  const travel = (target) => {
    const to = typeof target === 'string' ? target : target?.to;
    if (actRooms.some((r) => r.id === to)) {
      if (!reachableRooms.has(to)) {
        setNotice({ title: 'No way in yet', body: 'Follow the leads in this room before heading there.' });
        return;
      }
      setRoomId(to); setEvidence(null); setPuzzleSpot(null); setActiveChar(null);
    }
    else if (advanceReady) advanceAct();
    else setNotice({ title: 'Finish this chapter first', body: currentAct.objective });
  };

  const restartCase = async (from = 'act0') => {
    if (loginBusy) return;
    setRestartOpen(false);
    setLoginBusy(true);
    try {
      const restarted = await restartRun(from);
      clearIntros(); closeStory(); setRoomId(null); setChats({}); setEvidence(null);
      setActiveChar(null); setPuzzleSpot(null); setWon(null); setAccuseResult(null); setPhase('game');
      await loadGame('game');
      setNotice({
        kicker: 'Case reopened',
        title: restarted?.from === 'recent' ? `Back to ${restarted.act ?? 'the last act'}` : 'A fresh start',
        body: restarted?.penalty
          ? `${restarted.penalty} penalties added. The clock has not stopped.`
          : state?.practice
            ? 'Practice restart — no penalty. The clock keeps running.'
            : 'No penalty added. The clock keeps running.',
      });
    } catch {
      setNotice({ title: 'Could not restart', body: 'Please try again.' });
    } finally {
      setLoginBusy(false);
    }
  };
  const overlays = <>
    {leaderboardOpen && <Leaderboard team={state?.team} onClose={()=>setLeaderboardOpen(false)} />}
    {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    {chaptersOpen && <ChapterSelect acts={state?.acts ?? []} onSelect={beginPractice} onClose={() => setChaptersOpen(false)} busy={loginBusy} practice={state?.practice} onCampaign={returnCampaign} />}
    {restartOpen && <RestartConfirm
      onClose={() => setRestartOpen(false)}
      onConfirm={restartCase}
      busy={loginBusy}
      ended={Boolean(state?.ending || state?.solved)}
      recent={currentAct ? { kicker: currentAct.kicker, title: currentAct.title } : null}
      restartCost={state?.practice || state?.ending || state?.solved ? 0 : state?.restartPenalty ?? 10}
      resumeCost={state?.practice ? 0 : state?.resumePenalty ?? 25}
    />}
    {/* Notices and the deploy chip live above every phase, not just the room:
        a failed cinematic save or chapter start must still say so. */}
    {notice && !evidence && <Notice notice={notice} onClose={() => setNotice(null)} />}
    {staleBuild && (
      <button className="update-chip" onClick={() => window.location.reload()}>
        New build ready — refresh ↺
      </button>
    )}
  </>;
  const audio = <Soundtrack roomId={roomId ?? 'gazebo'} radio={!story} />;

  // Fullscreen enforcement is active whenever the deployment enforces it and
  // this team is a real event entry (practice saves and exempt teams step out).
  // /api/state also carries the server's verdict, so a failed /api/auth/config
  // can never silently switch enforcement off for the session.
  const fsGate = (authConfig?.fullscreen || state?.fullscreen) && state && !state.practice && !state.exempt ? (
    <FullscreenGate
      enabled
      graceMs={state.windowMs ?? authConfig.windowMs ?? state.graceMs ?? authConfig.graceMs ?? 10000}
      maxStrikes={state.maxStrikes ?? authConfig.maxStrikes ?? 3}
      strikes={state.strikes ?? 0}
      onStrike={(res) => {
        if (res?.strikes != null) setState((s) => (s ? { ...s, strikes: res.strikes } : s));
      }}
      onDisqualified={handleDisqualified}
    />
  ) : null;

  const announcement = state?.announcement && dismissedAnn !== state.announcement.id ? (
    <div className={`announce-bar ${state.announcement.level ?? 'info'}`} role="status">
      <strong>{state.announcement.level === 'urgent' ? 'Invigilator' : state.announcement.level === 'warning' ? 'Notice' : 'Event desk'}</strong>
      <span>{state.announcement.text}</span>
      <button onClick={() => setDismissedAnn(state.announcement.id)} aria-label="Dismiss announcement">×</button>
    </div>
  ) : null;

  if (phase === 'loading') {
    return (
      <div className="center-screen">
        <p className="loader">Setting the scene…</p>
      </div>
    );
  }

  if (phase === 'disqualified') {
    return (
      <DisqualifiedScreen
        info={dqInfo}
        onRequalified={() => {
          setDqInfo(null);
          loadGame('game');
        }}
      />
    );
  }

  if (phase === 'login' || phase === 'menu') {
    // A finished run never resumes into its own ending: the title offers the
    // restart choices instead, or the game would loop on the ending card.
    const resumeOrReopen = () => {
      if (state?.ending || state?.solved) { setRestartOpen(true); return; }
      setPhase('loading');
      loadGame('game');
    };
    return <>{audio}<TitleScreen config={authConfig} state={state} busy={loginBusy} error={loginError}
      onGuest={beginGuest} onResume={resumeOrReopen} onRestart={() => setRestartOpen(true)}
      onLeaderboard={()=>setLeaderboardOpen(true)} onDevLogin={handleDevLogin} onSettings={() => setSettingsOpen(true)} onChapters={() => setChaptersOpen(true)} />{overlays}</>;
  }

  if (devBeat && state?.acts?.length) {
    const cinematic = state.acts.find((a) => a.type === 'cinematic') ?? state.acts[0];
    if (cinematic?.type === 'cinematic') {
      const next = nextActFor(cinematic);
      return (
        <>{audio}{overlays}<ActDirector
          key={cinematic.id}
          act={cinematic}
          characters={state.characters}
          busy={actBusy}
          onComplete={() => finishAct(cinematic.id)}
          nextActKicker={next?.kicker}
          nextActTitle={next?.title}
          endLabel={next ? (next.type === 'cinematic' ? 'Continue' : 'Enter') : undefined}
        /></>
      );
    }
  }

  if (ending) {
    return (
      <div>{audio}{announcement}<EndingCard
        ending={ending}
        score={score}
        penalties={state.penalties ?? 0}
        team={state.team}
        title={state.title}
        onReplay={() => setPhase('menu')}
        onRestart={() => setRestartOpen(true)}
      />{overlays}{fsGate}</div>
    );
  }

  if (phase === 'solved') {
    return (
      <div className="center-screen">
        {announcement}
        <div className="login-card certificate">
          <p className="login-kicker">The case is closed</p>
          <h1 className="login-title">Solved</h1>
          <p className="login-sub">{state.title}</p>
          {won && (
            <div className="solved-details">
              <p>
                <strong>{state.characters.find((c) => c.id === won.culprit)?.name}</strong> — your
                accusation held.
              </p>
              <p className="solved-quote">“{won.method}”</p>
              <p className="solved-quote">“{won.motive}”</p>
            </div>
          )}
          <p className="login-hint">The leaderboard is watching you.</p>
          <div className="solved-actions">
            <button className="btn brass" onClick={() => setRestartOpen(true)}>Restart the case ↺</button>
            <button className="btn ghost" onClick={() => setPhase('menu')}>Back to the title</button>
          </div>
        </div>
        {overlays}
        {fsGate}
      </div>
    );
  }

  if (currentAct?.type === 'cinematic') {
    const next = nextActFor(currentAct);
    return (
      <>{audio}{announcement}{overlays}<ActDirector
        key={currentAct.id}
        act={currentAct}
        characters={state.characters}
        busy={actBusy}
        onLeaderboard={()=>setLeaderboardOpen(true)}
        onComplete={() => finishAct(currentAct.id)}
        nextActKicker={next?.kicker}
        nextActTitle={next?.title}
        endLabel={next ? (next.type === 'cinematic' ? 'Continue' : 'Enter') : undefined}
      />{fsGate}</>
    );
  }

  return (
    <div className={`app ${activeChar ? 'talking' : ''}`}>
      {audio}{announcement}{overlays}{fsGate}
      <div className="scene-layer">
        {!story && <Scene
          state={displayState}
          roomId={roomId}
          focus={focusHotspot}
          onCharacter={openCharacter}
          onClue={findClue}
          onPuzzle={openPuzzle}
          onTravel={travel}
          solvedPuzzles={state.solvedPuzzles ?? []}
        />}
        <div className="vignette" />
      </div>

      <header className="hud-top release-hud">
        <div className="location"><p className="location-kicker">{currentAct?.kicker} · {currentAct?.title}{state.practice ? ' · Practice' : ''}</p><h1 className="location-name">{room.name}</h1><p className="hud-objective">{currentAct?.objective}</p></div>
        <div className="release-tools">
          <span className="penalty-counter" title="Case penalties">{state.penalties ?? 0} {(state.penalties ?? 0) === 1 ? 'penalty' : 'penalties'}</span>
          {(state.strikes ?? 0) > 0 && <span className="penalty-counter strike-counter" title="Three exits without returning inside the grace window disqualify the team">{state.strikes}/{state.maxStrikes ?? 3} exit strikes</span>}
          <button className="quiet-button" onClick={() => setSettingsOpen(true)}>Settings</button>
          {!authConfig?.eventMode && <button className="quiet-button" onClick={() => setChaptersOpen(true)}>Chapters</button>}
          <button className="quiet-button" onClick={()=>setLeaderboardOpen(true)}>Live leaderboard</button>
          {!authConfig?.eventMode && <button className="quiet-button" onClick={()=>{setAccuseResult(null);setAccuseOpen(true);}}>Accuse</button>}
          <button className="quiet-button" onClick={() => { setStory(null); window.location.assign('/'); }}>Menu</button>
          <LogoutButton disabled={actBusy || puzzleBusy || typing || accuseBusy}/>
        </div>
      </header>
      <div className="chapter-progress" aria-label="Campaign progress">{state.acts.map((a, i) => <span key={a.id} className={a.id === state.act ? 'current' : i < state.acts.findIndex((x) => x.id === state.act) ? 'done' : ''} title={a.title}>{i}</span>)}</div>
      {advanceReady && <button className="next-chapter" onClick={advanceAct} disabled={actBusy || !!story}>{actBusy ? 'Saving…' : currentAct.id === 'act8' ? 'Finish the case →' : 'Continue to next act →'}</button>}
      {!activeChar && <>
        {!exploreOpen && <button className="explore-toggle" onClick={() => setExploreOpen(true)}>Explore this room ↗</button>}
        {exploreOpen && <aside className="explore-panel" aria-label="Room interactions">
          <header className="explore-head">
            <div>
              <p className="case-eyebrow">In this room</p>
              <h2>{room.name}</h2>
              <p className="case-muted">Inspect an object or follow a lead.</p>
            </div>
            <button className="case-close" onClick={() => setExploreOpen(false)} aria-label="Close explore">×</button>
          </header>
          <div className="explore-list">
            {(displayRooms.find((r) => r.id === roomId)?.hotspots ?? []).map((h) => {
              const done = h.type === 'clue' ? state.discovered.includes(h.clue) : state.solvedPuzzles.includes(h.puzzle);
              return <button key={h.id} className="explore-item" onClick={() => { if(h.type === 'clue') findClue(h); else if(h.type === 'puzzle') openPuzzle(h); else if(h.type === 'character') openCharacter(h); else travel(h); }}>
                <span className={'interaction-icon ' + h.type}>{done ? '✓' : h.type === 'clue' ? '◇' : h.type === 'character' ? '◉' : h.type === 'travel' ? '↗' : '⌘'}</span>
                <span className="explore-item-text"><strong>{h.label}</strong><small>{done ? 'Logged · inspect again' : h.type === 'clue' ? 'Evidence' : h.type === 'puzzle' ? 'Investigate' : h.type === 'character' ? 'Talk' : 'Travel'}</small></span>
              </button>;
            })}
          </div>
          <footer className="explore-foot"><p className="case-muted">New leads appear as you collect evidence. Your notebook keeps every exhibit.</p></footer>
        </aside>}
      </>}
      <div className="camera-hint">Drag to look · Scroll to zoom · WASD to move</div>

      <button
        className={`notebook-toggle ${notebookOpen ? 'open' : ''}`}
        onClick={() => setNotebookOpen((o) => !o)}
      >
        <span className="notebook-icon">◆</span>
        <span className="notebook-label">Notebook</span>
      </button>

      {notebookOpen && (
        <Notebook state={state} onClose={() => setNotebookOpen(false)} />
      )}

      {!activeChar && (
        <footer className="room-tabs">
          {actRooms.map((r) => {
            const open = reachableRooms.has(r.id);
            return (
              <button
                key={r.id}
                className={`tab ${r.id === roomId ? 'active' : ''}`}
                onClick={() => travel(r.id)}
                disabled={!open}
                title={open ? r.name : `${r.name} — no way in yet`}
              >
                {r.name}
              </button>
            );
          })}
        </footer>
      )}

      {activeCharacter && (
        <DialogueOverlay
          key={activeCharacter.id}
          character={activeCharacter}
          subtitle={focusHotspot?.label?.split(',')[1]?.trim() ?? null}
          location={room.name}
          area={currentAct ? `${currentAct.kicker} · ${currentAct.title}` : null}
          messages={chats[activeCharacter.id] ?? []}
          typing={typing}
          onAsk={ask}
          error={chatError}
          disabled={state.solved}
          onClose={() => setActiveChar(null)}
        />
      )}

      {evidence && <EvidenceCard clue={evidence} onClose={() => setEvidence(null)} />}
      {accuseOpen && (
        <AccuseModal
          state={state}
          onClose={() => setAccuseOpen(false)}
          onSubmit={submitAccusation}
          result={accuseResult}
          busy={accuseBusy}
        />
      )}
      {activePuzzle && (
        <PuzzleModal
          team={state.team}
          relatedClues={(activePuzzle.requires?.clues ?? []).filter(id => state.discovered.includes(id)).map(id => state.clues.find(c => c.id === id)).filter(Boolean)}
          puzzle={{ ...activePuzzle, title: puzzleSpot?.label }}
          solved={(state.solvedPuzzles ?? []).includes(activePuzzle.id)}
          penalties={state.penalties ?? 0}
          onSolve={handleSolve}
          onClose={closePuzzle}
          busy={puzzleBusy}
          result={puzzleResult}
          clueLabels={clueLabels}
        />
      )}
      {story && (
        <CinematicStory key={story.key} story={story} act={currentAct} characters={state.characters} onDone={completeStory} busy={actBusy || puzzleBusy} />
      )}
    </div>
  );
}
