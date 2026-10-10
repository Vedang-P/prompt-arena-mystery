import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-500-italic.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/eb-garamond/latin-600.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import App from './App.jsx';
import { SettingsProvider } from './Settings.jsx';
import './styles.css';
import './styles-scene.css';
import './styles-cinema.css';
import './release.css';

createRoot(document.getElementById('root')).render(<SettingsProvider><App /></SettingsProvider>);
