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
createRoot(document.getElementById('root')).render(
  <SettingsProvider>
    <Suspense fallback={<div className="center-screen"><p className="loader">Preparing the scene…</p></div>}>
      <Application />
    </Suspense>
  </SettingsProvider>
);

import './event.css';
import './scene-fixes.css';
import './investigation.css';
import './case-ui.css';
import './event-control.css';
