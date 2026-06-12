import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import 'react-diff-view/style/index.css';
import './styles.css';
import './code-themes.css';
import { App } from './App';
import { initialAppTheme, initialCodeTheme, resolveCodeTheme } from './theme';

// Set theme attributes before first paint to avoid a flash of the wrong theme.
const app = initialAppTheme();
document.documentElement.dataset.theme = app;
document.documentElement.dataset.codeTheme = resolveCodeTheme(initialCodeTheme(), app);

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
