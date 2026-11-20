import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RebuiltApp } from './rebuild/app';
import './rebuild/rebuild.css';
import { prepareTelegramApp } from './telegram';

prepareTelegramApp();
createRoot(document.getElementById('root')!).render(<StrictMode><RebuiltApp /></StrictMode>);
