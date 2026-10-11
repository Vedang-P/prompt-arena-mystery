import React, { lazy, Suspense } from 'react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import { createRoot } from 'react-dom/client';
import { SettingsProvider } from './Settings.jsx';
import './styles.css';
import './styles-scene.css';
import './styles-cinema.css';
import './release.css';

const isSceneReview = import.meta.env.DEV && new URLSearchParams(location.search).has('review');
const Application = lazy(() => isSceneReview ? import('./SceneReview.jsx') : import('./App.jsx'));
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
