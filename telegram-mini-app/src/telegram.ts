type TelegramViewportEvent = 'viewportChanged' | 'fullscreenChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged';
type Insets = { top?: number; bottom?: number; left?: number; right?: number };

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
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (eventType: TelegramViewportEvent, handler: () => void) => void;
  offEvent?: (eventType: TelegramViewportEvent, handler: () => void) => void;
  openLink: (url: string) => void;
  colorScheme: 'light' | 'dark';
  themeParams: { bg_color?: string; text_color?: string };
};

declare global {
  interface Window { Telegram?: { WebApp: TelegramWebApp }; }
}

export function telegramApp() { return window.Telegram?.WebApp ?? null; }

let releaseViewport: (() => void) | null = null;
const positive = (value: number | undefined, fallback: number) => value != null && Number.isFinite(value) && value > 0 ? value : fallback;
const inset = (value: number | undefined) => value != null && Number.isFinite(value) ? Math.max(0, value) : 0;

function observeViewport(app: TelegramWebApp | null) {
  releaseViewport?.();
  let frame = 0;
  let active = true;
  let stableHeight = window.innerHeight;
  const root = document.documentElement;
  const visual = window.visualViewport;
  const sync = () => {
    frame = 0;
    if (!active) return;
    const editing = document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, select, [contenteditable="true"]');
    if (!editing) stableHeight = window.innerHeight;
    else stableHeight = Math.max(stableHeight, window.innerHeight);
    const stable = positive(app?.viewportStableHeight, stableHeight);
    const top = inset(visual?.offsetTop), left = inset(visual?.offsetLeft);
    const nativeHeight = positive(app?.viewportHeight, window.innerHeight);
    const height = Math.max(1, Math.min(positive(visual?.height, window.innerHeight), nativeHeight - top));
    root.style.setProperty('--telegram-viewport-height', `${stable}px`);
    root.style.setProperty('--lc-visible-height', `${height}px`);
    root.style.setProperty('--lc-visible-width', `${positive(visual?.width, window.innerWidth)}px`);
    root.style.setProperty('--lc-visible-top', `${top}px`);
    root.style.setProperty('--lc-visible-left', `${left}px`);
    root.dataset.keyboard = editing && stable - height > 80 ? 'true' : 'false';
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      root.style.setProperty(`--telegram-safe-${side}`, `${inset(app?.safeAreaInset?.[side])}px`);
      const fallback = side === 'top' && app?.isFullscreen && !app.contentSafeAreaInset ? 56 : 0;
      root.style.setProperty(`--telegram-content-safe-${side}`, `${app?.contentSafeAreaInset ? inset(app.contentSafeAreaInset[side]) : fallback}px`);
    }
  };
  const schedule = () => { if (!frame && active) frame = window.requestAnimationFrame(sync); };
  const orientation = () => { stableHeight = window.innerHeight; schedule(); };
  const telegramEvents: TelegramViewportEvent[] = ['viewportChanged', 'fullscreenChanged', 'safeAreaChanged', 'contentSafeAreaChanged'];
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', orientation);
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  for (const event of telegramEvents) app?.onEvent?.(event, schedule);
  sync();
  releaseViewport = () => {
    active = false;
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', orientation);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    for (const event of telegramEvents) app?.offEvent?.(event, schedule);
  };
}

export function prepareTelegramApp() {
  const app = telegramApp();
  // Размер видимой области нужен и в обычном браузере, в том числе без Telegram.
  observeViewport(app);
  if (!app) return null;
  document.documentElement.dataset.telegram = 'true';
  const attempt = (action: () => void) => { try { action(); } catch { /* Старые клиенты могут не поддерживать метод. */ } };
  attempt(() => app.ready());
  attempt(() => app.setHeaderColor?.('#f6f7f8'));
  attempt(() => app.setBackgroundColor?.('#f6f7f8'));
  attempt(() => app.disableVerticalSwipes?.());
  const [major] = (app.version ?? '0').split('.').map(Number);
  // Режим окна выбирается один раз. События клавиатуры не вызывают expand().
  if (major >= 8 && app.requestFullscreen && !app.isFullscreen) {
    try { app.requestFullscreen(); } catch { attempt(() => app.expand()); }
  } else if (!app.isFullscreen && !app.isExpanded) attempt(() => app.expand());
  return app;
}
