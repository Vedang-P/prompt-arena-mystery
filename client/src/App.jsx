import { useEffect, useMemo, useRef, useState } from 'react';
import Scene from './Scene.jsx';
import TitleScreen, { ChapterSelect, EvidenceCard } from './TitleScreen.jsx';
import CinematicStory from './CinematicStory.jsx';
import { SettingsPanel, useSettings } from './Settings.jsx';
import Soundtrack from './Soundtrack.jsx';
import Leaderboard from './Leaderboard.jsx';
import ActDirector from './ActDirector.jsx';
import {
  AccuseModal,
  DialogueOverlay,
  EndingCard,
  Login,
  Notebook,
  Notice,
  PuzzleModal,
  StoryOverlay,
} from './Panels.jsx';
import {
  accuse,
  completeAct,
  devLogin,
  discoverClue,
  getAuthConfig,
  getHistory,
  getState,
  interrogate,
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
  const { sound, update } = useSettings();
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { setSettingsOpen(false); setChaptersOpen(false); setLeaderboardOpen(false); setEvidence(null); setNotebookOpen(false); setPuzzleSpot(null); setActiveChar(null); setExploreOpen(false); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
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
      const data = await getState();
      setState(data);
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
      if (e.status === 401) setPhase('login');
      else { setLoginError('The case server is unavailable. Try again in a moment.'); setPhase('login'); }
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

  useEffect(() => {
    loadGame();
    getAuthConfig()
      .then(setAuthConfig)
      .catch(() => setAuthConfig({ google: false, devLogin: false }));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

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
    setNotebookOpen(false);
    const placement = state.rooms.flatMap(r => r.hotspots).find(h => h.puzzle === devPuzzle);
    setPuzzleSpot({ puzzle: devPuzzle, label: placement?.label ?? 'Examine the clue' });
    setPuzzleResult(null);
  }, [devPuzzle, devBeat, state, phase]);

  const completeStory = () => {
    if (!story) return;
    const current = story;
    setStory(null);
    if (current.after === 'intro') {
      sessionStorage.setItem(current.key, '1');
      return;
    }
    clearNextIntro(current.actId);
    finishAct(current.actId);
  };

  const advanceAct = () => {
    if (!currentAct || !state?.canAdvance?.ok || actBusy || story) return;
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

  const openPuzzle = (target) => {
    const id = typeof target === 'string' ? target : target?.puzzle;
    if (!id) return;
    setNotebookOpen(false);
    const placement = state.rooms.flatMap(r => r.hotspots).find(h => h.puzzle === id);
    setPuzzleSpot(typeof target === 'string' ? { puzzle: id, label: placement?.label ?? 'Examine the clue' } : target);
    setPuzzleResult(null);
  };

  const closePuzzle = () => {
    setPuzzleSpot(null);
    setPuzzleResult(null);
  };

  const handleSolve = async (answer) => {
    if (!activePuzzle) return;
    setPuzzleBusy(true);
    setPuzzleResult(null);
    try {
      const res = await solvePuzzle(activePuzzle.id, answer);
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
    } catch (e) {
      if (e.status === 403) {
        setPuzzleResult({ correct: false, message: 'This lead is locked. Inspect the other evidence first.', penalty: 0 });
      } else if (e.status === 404) {
        setNotice({ kicker: 'Missing', title: 'Dead end', body: 'That line of inquiry is not available.' });
        closePuzzle();
      } else {
        setPuzzleResult({ correct: false, message: 'The line went dead. Try again.', penalty: 0 });
      }
    } finally {
      setPuzzleBusy(false);
    }
  };

  const handleDevLogin = async (code) => {
    setLoginBusy(true);
    setLoginError(null);
    try {
      localStorage.setItem('moon-mode','campaign');
      await devLogin(code);
      clearIntros(); setStory(null); setRoomId(null); setChats({}); setActiveChar(null); setEvidence(null); setPuzzleSpot(null);
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
    try {
      await interrogate(character, text, {
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
        setTimeout(() => {
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
      clearIntros(); setStory(null); setRoomId(null); setChats({}); setNotice(null); setActiveChar(null); setEvidence(null); setPuzzleSpot(null);
      await loadGame('game');
    } catch { setLoginError('Could not open the case. Please try again.'); }
    finally { setLoginBusy(false); }
  };
  const beginPractice = async (actId) => {
    setLoginBusy(true);
    try {
      await startPractice(actId); localStorage.setItem('moon-mode', 'practice'); clearIntros();
      setChaptersOpen(false); setStory(null); setRoomId(null); setChats({}); setEvidence(null); setActiveChar(null); setPuzzleSpot(null);
      await loadGame('game');
    } catch { setNotice({ title: 'Chapter unavailable', body: 'Please try again.' }); }
    finally { setLoginBusy(false); }
  };
  const returnCampaign = async () => {
    localStorage.setItem('moon-mode', 'campaign'); setChaptersOpen(false); setStory(null); setRoomId(null); setChats({});
    await loadGame('game');
  };
  const travel = (target) => {
    const to = typeof target === 'string' ? target : target?.to;
    if (actRooms.some((r) => r.id === to)) { setRoomId(to); setEvidence(null); setPuzzleSpot(null); setActiveChar(null); }
    else if (state.canAdvance?.ok) advanceAct();
    else setNotice({ title: 'Finish this chapter first', body: currentAct.objective });
  };
  const overlays = <>
    {leaderboardOpen && <Leaderboard team={state?.team} onClose={()=>setLeaderboardOpen(false)} />}
    {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    {chaptersOpen && <ChapterSelect acts={state?.acts ?? []} onSelect={beginPractice} onClose={() => setChaptersOpen(false)} busy={loginBusy} practice={state?.practice} onCampaign={returnCampaign} />}
  </>;
  const audio = <Soundtrack roomId={roomId ?? 'gazebo'} />;

  if (phase === 'loading') {
    return (
      <div className="center-screen">
        <p className="loader">Setting the scene…</p>
      </div>
    );
  }

  if (phase === 'login' || phase === 'menu') {
    return <>{audio}<TitleScreen config={authConfig} state={state} busy={loginBusy} error={loginError}
      onGuest={beginGuest} onResume={() => setPhase(state.solved ? 'solved' : 'game')}
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
          onLeaderboard={()=>setLeaderboardOpen(true)}
          nextActKicker={next?.kicker}
          nextActTitle={next?.title}
          endLabel={next ? (next.type === 'cinematic' ? 'Continue' : 'Enter') : undefined}
        /></>
      );
    }
  }

  if (ending) {
    return (
      <div>{audio}<EndingCard
        ending={ending}
        score={score}
        penalties={state.penalties ?? 0}
        team={state.team}
        title={state.title}
        onReplay={() => setPhase('menu')}
      />{overlays}</div>
    );
  }

  if (phase === 'solved') {
    return (
      <div className="center-screen">
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
        </div>
      </div>
    );
  }

  if (currentAct?.type === 'cinematic') {
    const next = nextActFor(currentAct);
    return (
      <>{audio}{overlays}<ActDirector
        key={currentAct.id}
        act={currentAct}
        characters={state.characters}
        busy={actBusy}
        onLeaderboard={()=>setLeaderboardOpen(true)}
        onComplete={() => finishAct(currentAct.id)}
        nextActKicker={next?.kicker}
        nextActTitle={next?.title}
        endLabel={next ? (next.type === 'cinematic' ? 'Continue' : 'Enter') : undefined}
      /></>
    );
  }

  return (
    <div className={`app ${activeChar ? 'talking' : ''}`}>
      {audio}{overlays}
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
        <div className="release-tools"><span className="save-status">{actBusy || puzzleBusy ? 'Saving…' : '● Case saved'}</span>
          <button className="quiet-button" onClick={() => update({ sound: !sound })} aria-label={sound ? 'Mute sound' : 'Enable sound'}>{sound ? 'Sound on' : 'Sound off'}</button>
          <button className="quiet-button" onClick={() => setSettingsOpen(true)}>Settings</button>
          {!authConfig?.eventMode && <button className="quiet-button" onClick={() => setChaptersOpen(true)}>Chapters</button>}
          <button className="quiet-button" onClick={()=>setLeaderboardOpen(true)}>Live leaderboard</button>
          <button className="quiet-button" onClick={() => { setStory(null); setPhase('menu'); }}>Menu</button>
        </div>
      </header>
      <div className="chapter-progress" aria-label="Campaign progress">{state.acts.map((a, i) => <span key={a.id} className={a.id === state.act ? 'current' : i < state.acts.findIndex((x) => x.id === state.act) ? 'done' : ''} title={a.title}>{i}</span>)}</div>
      {state.canAdvance?.ok && <button className="next-chapter" onClick={advanceAct} disabled={actBusy || !!story}>{actBusy ? 'Saving…' : currentAct.id === 'act8' ? 'Finish the case →' : 'Continue to next act →'}</button>}
      <div className="investigation-count"><b>{state.discovered.length}</b> exhibits <span>·</span> <b>{state.solvedPuzzles.length}</b> puzzles <span>·</span> {state.penalties} penalties</div>
      {!activeChar && <><button className="explore-toggle" onClick={() => setExploreOpen((o) => !o)}>{exploreOpen ? 'Close explore ×' : 'Explore this room ↗'}</button>
      {exploreOpen && <aside className="explore-panel" aria-label="Room interactions"><p className="eyebrow">In this room</p><h2>{room.name}</h2><p>Inspect an object or follow a lead.</p>
        {(displayRooms.find((r) => r.id === roomId)?.hotspots ?? []).map((h) => {
          const done = h.type === 'clue' ? state.discovered.includes(h.clue) : state.solvedPuzzles.includes(h.puzzle);
          return <button key={h.id} onClick={() => { if(h.type === 'clue') findClue(h); else if(h.type === 'puzzle') openPuzzle(h); else if(h.type === 'character') openCharacter(h); else travel(h); }}><span className={'interaction-icon ' + h.type}>{done ? '✓' : h.type === 'clue' ? '◇' : h.type === 'character' ? '◉' : h.type === 'travel' ? '↗' : '⌘'}</span><span>{h.label}<small>{done ? 'Logged · inspect again' : h.type === 'clue' ? 'Evidence' : h.type === 'puzzle' ? 'Investigate' : h.type === 'character' ? 'Talk' : 'Travel'}</small></span></button>;
        })}
        <p className="explore-hint">New leads appear as you collect evidence. Your notebook keeps every exhibit.</p>
      </aside>}</>}
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
          {actRooms.map((r) => (
            <button
              key={r.id}
              className={`tab ${r.id === roomId ? 'active' : ''}`}
              onClick={() => travel(r.id)}
            >
              {r.name}
            </button>
          ))}
        </footer>
      )}

      {activeCharacter && (
        <DialogueOverlay
          character={activeCharacter}
          subtitle={focusHotspot?.label?.split(',')[1]?.trim() ?? null}
          messages={chats[activeCharacter.id] ?? []}
          typing={typing}
          onAsk={ask}
          error={chatError}
          disabled={state.solved}
          onClose={() => setActiveChar(null)}
        />
      )}

      {evidence && <EvidenceCard clue={evidence} onClose={() => setEvidence(null)} />}
      {notice && !evidence && <Notice notice={notice} onClose={() => setNotice(null)} />}
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
        <CinematicStory key={story.key} story={story} act={currentAct} characters={state.characters} onDone={completeStory} busy={actBusy} />
      )}
    </div>
  );
}
