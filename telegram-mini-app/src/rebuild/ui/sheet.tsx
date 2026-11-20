import { type ReactNode, useEffect } from 'react';
import { Icon } from './icons';

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const scrollY = window.scrollY;
    const previous = { bodyOverflow: document.body.style.overflow, bodyPosition: document.body.style.position, bodyTop: document.body.style.top, bodyWidth: document.body.style.width, htmlOverflow: document.documentElement.style.overflow };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous.bodyOverflow; document.body.style.position = previous.bodyPosition; document.body.style.top = previous.bodyTop; document.body.style.width = previous.bodyWidth; document.documentElement.style.overflow = previous.htmlOverflow; window.scrollTo(0, scrollY); };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    let frame = 0;
    const syncKeyboard = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const keyboardHeight = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        document.documentElement.style.setProperty('--lc-keyboard-height', `${Math.round(keyboardHeight)}px`);
      });
    };
    syncKeyboard();
    viewport.addEventListener('resize', syncKeyboard);
    viewport.addEventListener('scroll', syncKeyboard);
    return () => { window.cancelAnimationFrame(frame); viewport.removeEventListener('resize', syncKeyboard); viewport.removeEventListener('scroll', syncKeyboard); document.documentElement.style.removeProperty('--lc-keyboard-height'); };
  }, []);
  const revealFocusedField = (event: React.FocusEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    const body = event.currentTarget.querySelector<HTMLElement>('.lc-sheet__body');
    window.setTimeout(() => body?.scrollTo({ top: Math.max(0, target.offsetTop - body.offsetTop - 36), behavior: 'auto' }), 120);
  };
  return <div className="lc-sheet-backdrop" role="presentation">
    <section className="lc-sheet" role="dialog" aria-modal="true" aria-label={title} onFocusCapture={revealFocusedField}>
      <div className="lc-sheet__handle" />
      <header className="lc-sheet__header"><h2>{title}</h2><button className="lc-icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></header>
      <div className="lc-sheet__body"><div className="lc-sheet__content">{children}</div></div>
      {footer ? <footer className="lc-sheet__footer">{footer}</footer> : null}
    </section>
  </div>;
}
