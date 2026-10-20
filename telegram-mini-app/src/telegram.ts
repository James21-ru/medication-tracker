export type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  isExpanded?: boolean;
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
  app.ready();
  expand();
  window.requestAnimationFrame(expand);
  window.setTimeout(expand, 120);
  app.onEvent?.('viewportChanged', () => {
    if (!app.isExpanded) expand();
  });
  return app;
}
