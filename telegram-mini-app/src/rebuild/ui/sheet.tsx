import { type ReactNode, useEffect } from 'react';
import { Icon } from './icons';

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const syncHeight = () => document.documentElement.style.setProperty('--lc-visible-height', `${viewport?.height ?? window.innerHeight}px`);
    syncHeight();
    viewport?.addEventListener('resize', syncHeight);
    window.addEventListener('resize', syncHeight);
    return () => { viewport?.removeEventListener('resize', syncHeight); window.removeEventListener('resize', syncHeight); document.documentElement.style.removeProperty('--lc-visible-height'); };
  }, []);
  const keepFocusedFieldVisible = (event: React.FocusEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 180);
  };
  return <div className="lc-sheet-backdrop" role="presentation">
    <section className="lc-sheet" role="dialog" aria-modal="true" aria-label={title} onFocusCapture={keepFocusedFieldVisible}>
      <div className="lc-sheet__handle" />
      <header className="lc-sheet__header"><h2>{title}</h2><button className="lc-icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></header>
      <div className="lc-sheet__body">{children}</div>
      {footer ? <footer className="lc-sheet__footer">{footer}</footer> : null}
    </section>
  </div>;
}
