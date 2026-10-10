import React from 'react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { SettingsProvider } from './Settings.jsx';
import './styles.css';
import './styles-scene.css';
import './styles-cinema.css';
import './release.css';

const Application=import.meta.env.DEV&&new URLSearchParams(location.search).has('review')
  ? (await import('./SceneReview.jsx')).default : App;
createRoot(document.getElementById('root')).render(<SettingsProvider><Application /></SettingsProvider>);

import './event.css';
import './scene-fixes.css';
import './investigation.css';
