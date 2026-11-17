import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './ui/App';
import { init } from './store/state';

try {
  const t = localStorage.getItem('reo-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* storage unavailable: falls back to the device setting */ }
registerSW({ immediate: true });
void init();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
