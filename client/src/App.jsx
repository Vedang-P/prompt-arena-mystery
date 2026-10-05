import { useEffect, useMemo, useState } from 'react';
import Scene from './Scene.jsx';
import ActDirector from './ActDirector.jsx';
import { AccuseModal, DialogueOverlay, Login, Notebook, Notice } from './Panels.jsx';
import { accuse, completeAct, discoverClue, getHistory, getState, interrogate, login } from './api.js';

function mergeUnlocked(existing, added) {
  const seen = new Set(existing.map((f) => f.fact));
  return [...existing, ...added.filter((f) => !seen.has(f.fact))];
}

export default function App() {
  const [phase, setPhase] = useState('loading');
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
  const [loginError, setLoginError] = useState(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [won, setWon] = useState(null);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [actBusy, setActBusy] = useState(false);

  const currentAct = useMemo(
    () => state?.acts?.find((a) => a.id === state.act) ?? state?.acts?.[0] ?? null,
    [state]
  );

  const finishAct = async (actId) => {
    setActBusy(true);
    try {
      const res = await completeAct(actId);
      setState((s) => ({ ...s, act: res.act }));
    } catch {
      // Network hiccup: let them in anyway so a dropped packet can't stall the event.
      setState((s) => ({ ...s, act: 'act1' }));
    } finally {
      setActBusy(false);
    }
  };

  const loadGame = async () => {
    try {
      const data = await getState();
      setState(data);
      setRoomId((prev) => prev ?? data.rooms[0].id);
      setPhase(data.solved ? 'solved' : 'game');
      return true;
    } catch (e) {
      if (e.status === 401) setPhase('login');
      else setLoginError('Server unreachable.');
      return false;
    }
  };

  useEffect(() => {
    loadGame();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleLogin = async (code) => {
    setLoginBusy(true);
    setLoginError(null);
    try {
      await login(code);
      await loadGame();
    } catch (e) {
      setLoginError(e.status === 401 ? 'Wrong code. Check the label on your table.' : 'Login failed.');
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
      setNotice({
        kicker: 'Evidence logged',
        title: res.clue.name,
        body: res.clue.description,
        facts: res.newlyUnlocked,
      });
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
    } finally {
      setAccuseBusy(false);
    }
  };

  const activeCharacter = useMemo(
    () => state?.characters.find((c) => c.id === activeChar) ?? null,
    [state, activeChar]
  );

  const focusHotspot = useMemo(() => {
    if (!state || !activeChar) return null;
    for (const room of state.rooms) {
      for (const h of room.hotspots) {
        if (h.type === 'character' && h.character === activeChar) return h;
      }
    }
    return null;
  }, [state, activeChar]);

  const room = state?.rooms.find((r) => r.id === roomId) ?? state?.rooms?.[0];

  if (phase === 'loading') {
    return (
      <div className="center-screen">
        <p className="loader">Setting the scene…</p>
      </div>
    );
  }

  if (phase === 'login') {
    return <Login onLogin={handleLogin} error={loginError} busy={loginBusy} />;
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
    return (
      <ActDirector
        act={currentAct}
        characters={state.characters}
        busy={actBusy}
        onComplete={() => finishAct(currentAct.id)}
      />
    );
  }

  if (currentAct?.type === 'interactive') {
    return (
      <div className="center-screen">
        <div className="login-card act-teaser">
          <p className="login-kicker">Act I</p>
          <h1 className="login-title">{currentAct.title}</h1>
          <p className="login-sub">{state.subtitle}</p>
          <p className="act-objective">{currentAct.objective}</p>
          <p className="login-hint">
            Team {state.team} — Act 0 complete. The room, the laptop and the diary arrive in the next
            build.
          </p>
          <button className="btn ghost" onClick={() => setState((s) => ({ ...s, act: 'act0' }))}>
            Replay the vanishing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="scene-layer">
        <Scene
          state={state}
          roomId={roomId}
          focus={focusHotspot}
          onCharacter={openCharacter}
          onClue={findClue}
        />
        <div className="vignette" />
      </div>

      <header className="hud-top">
        <div className="location">
          <h1 className="location-name">{room.name}</h1>
          <p className="location-kicker">{state.title}</p>
        </div>
        <div className="case-bar">
          <span className="case-stat">
            Exhibits <b>{state.discovered.length}</b>
          </span>
          <span className="case-divider" />
          <button
            className="btn wine"
            onClick={() => {
              setAccuseResult(null);
              setAccuseOpen(true);
            }}
          >
            Accuse
          </button>
        </div>
      </header>

      <button
        className={`notebook-toggle ${notebookOpen ? 'open' : ''}`}
        onClick={() => setNotebookOpen((o) => !o)}
      >
        <span className="notebook-icon">◆</span>
        <span className="notebook-label">Notebook</span>
      </button>

      {notebookOpen && (
        <div className="notebook-panel">
          <Notebook state={state} onClose={() => setNotebookOpen(false)} />
        </div>
      )}

      {!activeChar && (
        <footer className="room-tabs">
          {state.rooms.map((r) => (
            <button
              key={r.id}
              className={`tab ${r.id === roomId ? 'active' : ''}`}
              onClick={() => setRoomId(r.id)}
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

      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
      {accuseOpen && (
        <AccuseModal
          state={state}
          onClose={() => setAccuseOpen(false)}
          onSubmit={submitAccusation}
          result={accuseResult}
          busy={accuseBusy}
        />
      )}
    </div>
  );
}
