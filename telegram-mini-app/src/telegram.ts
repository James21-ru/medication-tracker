export type TelegramWebApp = {
  initData: string;
  version?: string;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  isFullscreen?: boolean;
  disableVerticalSwipes?: () => void;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (eventType: 'viewportChanged' | 'fullscreenChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged', handler: () => void) => void;
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

  // Use the native fullscreen API where the Telegram client supports it. Older
  // clients retain the expanded Mini App behavior instead of failing to open.
  const expand = () => app.expand();
  const versionAtLeast = (required: string) => {
    const current = (app.version ?? '0.0').split('.').map(Number);
    const target = required.split('.').map(Number);
    return current[0] > target[0] || (current[0] === target[0] && (current[1] ?? 0) >= (target[1] ?? 0));
  };
  let fullscreenRequested = false;
  const requestFullscreen = () => {
    // Older Telegram clients expose this method but throw instead of reporting
    // it unsupported. Fullscreen is available only in modern clients; all
    // other versions use the stable expanded Mini App mode.
    if (versionAtLeast('8.0') && app.requestFullscreen && !app.isFullscreen && !fullscreenRequested) {
      fullscreenRequested = true;
      try { app.requestFullscreen(); }
      catch { expand(); }
    }
    else if (!app.isFullscreen) expand();
  };
  const syncInsets = () => {
    const root = document.documentElement.style;
    const contentInsets = app.contentSafeAreaInset ?? app.safeAreaInset;
    root.setProperty('--telegram-safe-top', `${contentInsets?.top ?? 0}px`);
    root.setProperty('--telegram-safe-bottom', `${contentInsets?.bottom ?? 0}px`);
    root.setProperty('--telegram-safe-left', `${contentInsets?.left ?? 0}px`);
    root.setProperty('--telegram-safe-right', `${contentInsets?.right ?? 0}px`);
  };
  const syncViewportHeight = () => {
    const height = app.viewportStableHeight ?? app.viewportHeight;
    if (height && Number.isFinite(height)) document.documentElement.style.setProperty('--telegram-viewport-height', `${height}px`);
  };
  app.ready();
  app.setHeaderColor?.('#f6f7f8');
  app.setBackgroundColor?.('#f6f7f8');
  // A swipe inside a scrollable sheet must never be interpreted by Telegram as
  // a request to dismiss the whole Mini App.
  app.disableVerticalSwipes?.();
  document.documentElement.dataset.telegram = 'true';
  syncViewportHeight();
  syncInsets();
  requestFullscreen();
  window.requestAnimationFrame(() => { syncViewportHeight(); syncInsets(); requestFullscreen(); });
  window.setTimeout(() => { syncViewportHeight(); syncInsets(); requestFullscreen(); }, 120);
  app.onEvent?.('viewportChanged', () => {
    syncViewportHeight();
    if (!app.isFullscreen && !app.isExpanded) expand();
  });
  app.onEvent?.('fullscreenChanged', () => { syncViewportHeight(); syncInsets(); });
  app.onEvent?.('safeAreaChanged', syncInsets);
  app.onEvent?.('contentSafeAreaChanged', syncInsets);
  return app;
}
