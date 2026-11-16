import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './ui/App';
import { init } from './store/state';

registerSW({ immediate: true });
void init();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
