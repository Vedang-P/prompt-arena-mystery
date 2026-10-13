import React, { lazy, Suspense } from 'react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/josefin-sans/latin-300.css';
import '@fontsource/josefin-sans/latin-400.css';
import { createRoot } from 'react-dom/client';
import { SettingsProvider } from './Settings.jsx';
import { registerAssetCache } from './registerSW.js';
import './styles.css';
import './styles-scene.css';
import './styles-cinema.css';
import './release.css';

const devParams = new URLSearchParams(location.search);
const isSceneReview = import.meta.env.DEV && devParams.has('review');
const isPortraitStudio = import.meta.env.DEV && devParams.has('portraits');
const Application = lazy(() => isPortraitStudio ? import('./PortraitStudio.jsx') : isSceneReview ? import('./SceneReview.jsx') : import('./App.jsx'));
registerAssetCache();

// A deploy can retire a hashed chunk while a tab is open, and a lazy import then
// rejects with no boundary to catch it — the whole game would white-screen. This
// boundary catches it: a chunk failure reloads once automatically (the fresh
// shell points at the new chunks); anything else gets a visible reload card.
const CHUNK_RELOAD_KEY = 'pa-chunk-reloaded';
const isChunkError = (error) =>
  /Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
    String(error?.message ?? error)
  );
class AppBoundary extends React.Component {
  state = { failed: false, chunk: false };
  static getDerivedStateFromError(error) { return { failed: true, chunk: isChunkError(error) }; }
  componentDidCatch(error) {
    console.error('app_error', error?.message);
    if (isChunkError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
        }
      } catch {}
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center-screen">
        <div className="login-card certificate">
          <p className="login-kicker">Prompt Arena</p>
          <h1 className="login-title">{this.state.chunk ? 'A new version is live' : 'Something went wrong'}</h1>
          <p className="login-sub">
            {this.state.chunk
              ? 'Reload to pick up the latest build — your case is saved.'
              : 'Your case is saved. Reload to continue.'}
          </p>
          <div className="solved-actions">
            <button className="btn brass" onClick={() => { try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch {} window.location.reload(); }}>
              Reload ↺
            </button>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <SettingsProvider>
    <AppBoundary>
      <Suspense fallback={<div className="center-screen"><p className="loader">Preparing the scene…</p></div>}>
        <Application />
      </Suspense>
    </AppBoundary>
  </SettingsProvider>
);

import './event.css';
import './scene-fixes.css';
import './investigation.css';
import './case-ui.css';
import './event-control.css';
