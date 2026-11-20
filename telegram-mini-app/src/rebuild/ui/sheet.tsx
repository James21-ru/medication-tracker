import { type ReactNode, useEffect } from 'react';
import { Icon } from './icons';

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return <div className="lc-sheet-backdrop" role="presentation">
    <section className="lc-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="lc-sheet__handle" />
      <header className="lc-sheet__header"><h2>{title}</h2><button className="lc-icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></header>
      <div className="lc-sheet__body">{children}</div>
      {footer ? <footer className="lc-sheet__footer">{footer}</footer> : null}
    </section>
  </div>;
}
