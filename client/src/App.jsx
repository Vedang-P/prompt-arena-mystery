import { useEffect, useMemo, useState } from 'react';
import Scene from './Scene.jsx';
import { AccuseModal, ChatPanel, Login, Notebook, Notice } from './Panels.jsx';
import { accuse, discoverClue, getHistory, getState, interrogate, login } from './api.js';

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
        title: res.clue.name,
        body: res.clue.description,
        facts: res.newlyUnlocked,
      });
    } catch (e) {
      if (e.status === 409) {
        setNotice({ title: 'Locked', body: 'Something else has to come first.' });
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
        <div className="login-card solved">
          <h1>Case closed</h1>
          <p className="sub">{state.title}</p>
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
          <p className="hint">The leaderboard is watching you.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">{state.title}</span>
          <span className="brand-sub">Prompt Arena: Mystery</span>
        </div>
        <div className="meta">
          <span className={`badge ${state.llm ? 'live' : 'off'}`}>
            {state.llm ? 'live AI suspects' : 'AI offline — canned answers'}
          </span>
          <span className="badge">{state.team}</span>
          <span className="badge">evidence {state.discovered.length}</span>
        </div>
      </header>

      <div className="stage">
        <div className="scene-wrap">
          <Scene state={state} roomId={roomId} onCharacter={openCharacter} onClue={findClue} />
          <div className="vignette" />
        </div>
        <aside className="side">
          {activeCharacter ? (
            <ChatPanel
              character={activeCharacter}
              messages={chats[activeCharacter.id] ?? []}
              typing={typing}
              onAsk={ask}
              error={chatError}
              disabled={state.solved}
            />
          ) : (
            <Notebook state={state} />
          )}
        </aside>
      </div>

      <footer className="tabs">
        {state.rooms.map((room) => (
          <button
            key={room.id}
            className={`tab ${room.id === roomId ? 'active' : ''}`}
            onClick={() => {
              setRoomId(room.id);
              setActiveChar(null);
            }}
          >
            {room.name}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setActiveChar(null)} disabled={!activeChar}>
          Notebook
        </button>
        <button
          className="btn accuse"
          onClick={() => {
            setAccuseResult(null);
            setAccuseOpen(true);
          }}
        >
          Accuse
        </button>
      </footer>

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
