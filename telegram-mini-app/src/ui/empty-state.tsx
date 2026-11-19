import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon: 'check' | 'cabinet' | 'chart';
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

function EmptyIcon({ icon }: Pick<EmptyStateProps, 'icon'>) {
  if (icon === 'cabinet') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4z" /><path d="M3 7.5h18M8 12h8M7 18.5v2M17 18.5v2" /></svg>;
  if (icon === 'chart') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4M4 20h17M8 16v-4M12 16V8M16 16v-7" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.3 4.3L19 7" /></svg>;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return <section className={`app-empty-state ${className}`.trim()}>
    <div className={`app-empty-state__icon app-empty-state__icon--${icon}`}><EmptyIcon icon={icon} /></div>
    <h2>{title}</h2>
    <p>{description}</p>
    {action ? <div className="app-empty-state__action">{action}</div> : null}
  </section>;
}
