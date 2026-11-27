import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { RebuiltApp } from './rebuild/app';
import './rebuild/rebuild.css';
import './rebuild/layout.css';
import { prepareTelegramApp } from './telegram';

class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="lc-loading"><p>Не удалось открыть LifeCare</p><button className="lc-primary-button" onClick={() => window.location.reload()}>Попробовать еще раз</button></main>;
    return this.props.children;
  }
}

try { prepareTelegramApp(); } catch { /* The app must still open in legacy Telegram clients. */ }
createRoot(document.getElementById('root')!).render(<StrictMode><StartupBoundary><RebuiltApp /></StartupBoundary></StrictMode>);
