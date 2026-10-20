import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import './styles.css';
import { prepareTelegramApp } from './telegram';

prepareTelegramApp();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
