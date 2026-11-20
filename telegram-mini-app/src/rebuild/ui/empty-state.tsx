import { type ReactNode } from 'react';
import { Icon } from './icons';

export function EmptyState({ icon, title, description, action }: { icon: 'case' | 'calendar' | 'chart' | 'person'; title: string; description: string; action?: ReactNode }) {
  return <section className="lc-empty-state">
    <div className="lc-empty-state__icon"><Icon name={icon} /></div>
    <h2>{title}</h2>
    <p>{description}</p>
    {action ? <div className="lc-empty-state__action">{action}</div> : null}
  </section>;
}
