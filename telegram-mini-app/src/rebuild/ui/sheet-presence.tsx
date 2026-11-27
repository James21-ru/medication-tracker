import { useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import './sheet-motion.css';

// До конца анимации форма сохраняет содержимое и блокировку прокрутки.
export function SheetPresence({ children }: { children: ReactElement | null }) {
  const [retained, setRetained] = useState(children);
  const [opening, setOpening] = useState(0);
  const wasOpen = useRef(children !== null);
  const layer = useRef<HTMLDivElement | null>(null);
  const leaving = children === null && retained !== null;

  const present = useCallback((node: HTMLDivElement | null) => {
    layer.current = node;
    if (!node || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    const panel = node.querySelector<HTMLElement>(':scope > .lc-sheet-backdrop > .lc-sheet');
    const scrim = node.querySelector<HTMLElement>(':scope > .lc-sheet-backdrop > .lc-sheet-scrim');
    if (!panel || !scrim) return;
    const replacing = Array.from(node.parentElement?.children ?? [])
      .some((sibling) => sibling !== node && sibling.matches('.lc-sheet-presence[data-leaving]'));
    node.toggleAttribute('data-replacing', replacing);
    node.setAttribute('data-entering', '');
    // Фиксируем исходные стили до первого кадра. При прерывании CSS
    // продолжит переход от фактического положения панели и прозрачности фона.
    getComputedStyle(panel).transform;
    getComputedStyle(scrim).opacity;
    node.removeAttribute('data-entering');
  }, []);

  useLayoutEffect(() => {
    if (children) {
      // Быстрое повторное открытие должно начать новую форму с чистыми полями.
      if (!wasOpen.current && retained !== null) setOpening((previous) => previous + 1);
      setRetained(children);
    }
    wasOpen.current = children !== null;
  }, [children, retained]);

  useLayoutEffect(() => {
    if (!leaving) return;
    const root = layer.current;
    if (!root) return;
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRetained(null);
      return;
    }
    const targets = Array.from(root.querySelectorAll<HTMLElement>(
      ':scope > .lc-sheet-backdrop > .lc-sheet, :scope > .lc-sheet-backdrop > .lc-sheet-scrim',
    ));
    const transitions = targets.flatMap((target) => target.getAnimations?.() ?? []);
    if (transitions.length === 0) {
      setRetained(null);
      return;
    }
    let active = true;
    const finish = () => { if (active) setRetained(null); };
    const onVisibilityChange = () => { if (document.hidden) finish(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void Promise.allSettled(transitions.map((transition) => transition.finished)).then(finish);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [leaving]);

  if (!children && !retained) return null;
  return <div key={opening} ref={present} className="lc-sheet-presence" data-leaving={leaving || undefined}
    inert={leaving}>
    {children ?? retained}
  </div>;
}
