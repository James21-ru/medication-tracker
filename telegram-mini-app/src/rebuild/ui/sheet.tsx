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
  return <div className="lc-sheet-backdrop" role="presentation">
    <section className="lc-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="lc-sheet__handle" />
      <header className="lc-sheet__header"><h2>{title}</h2><button className="lc-icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></header>
      <div className="lc-sheet__body"><div className="lc-sheet__content">{children}</div></div>
      {footer ? <footer className="lc-sheet__footer">{footer}</footer> : null}
    </section>
  </div>;
}
