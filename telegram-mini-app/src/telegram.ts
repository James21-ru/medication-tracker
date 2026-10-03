export type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
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
  app?.ready();
  app?.expand();
  return app;
}
