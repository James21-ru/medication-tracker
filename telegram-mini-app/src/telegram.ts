export type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  onEvent?: (eventType: 'viewportChanged', handler: () => void) => void;
  openLink: (url: string) => void;
  colorScheme: 'light' | 'dark';
  themeParams: { bg_color?: string; text_color?: string };
};

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function telegramApp() {
  return window.Telegram?.WebApp ?? null;
}

export function prepareTelegramApp() {
  const app = telegramApp();
  if (!app) return null;

  // Telegram opens iOS Mini Apps in the compact sheet by default.  Expand as
  // early as possible, then repeat after the native sheet has measured itself.
  const expand = () => app.expand();
  const syncViewportHeight = () => {
    const height = app.viewportStableHeight ?? app.viewportHeight;
    if (height && Number.isFinite(height)) document.documentElement.style.setProperty('--telegram-viewport-height', `${height}px`);
  };
  app.ready();
  // A swipe inside a scrollable sheet must never be interpreted by Telegram as
  // a request to dismiss the whole Mini App.
  app.disableVerticalSwipes?.();
  document.documentElement.dataset.telegram = 'true';
  syncViewportHeight();
  expand();
  window.requestAnimationFrame(() => { syncViewportHeight(); expand(); });
  window.setTimeout(() => { syncViewportHeight(); expand(); }, 120);
  app.onEvent?.('viewportChanged', () => {
    syncViewportHeight();
    if (!app.isExpanded) expand();
  });
  return app;
}
