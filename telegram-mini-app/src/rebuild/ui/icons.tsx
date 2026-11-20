import type { SVGProps } from 'react';

type IconName = 'case' | 'calendar' | 'chart' | 'person' | 'plus' | 'chevron' | 'close' | 'check' | 'pill';

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.8 };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props} {...common}>
    {name === 'case' ? <><path d="M4 8.5h16v10H4z"/><path d="M8 8.5V6h8v2.5M4 13h16M10 13v2h4v-2"/></> : null}
    {name === 'calendar' ? <><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8 14h.01M12 14h.01M16 14h.01"/></> : null}
    {name === 'chart' ? <><path d="M4 20V4M4 20h17M8 16v-4M12 16V8M16 16v-7"/></> : null}
    {name === 'person' ? <><circle cx="12" cy="8" r="3"/><path d="M5 21c.6-4 3-6 7-6s6.4 2 7 6"/></> : null}
    {name === 'plus' ? <path d="M12 5v14M5 12h14"/> : null}
    {name === 'chevron' ? <path d="m9 18 6-6-6-6"/> : null}
    {name === 'close' ? <path d="m6 6 12 12M18 6 6 18"/> : null}
    {name === 'check' ? <path d="m5 12.5 4.3 4.3L19 7"/> : null}
    {name === 'pill' ? <><path d="m7.2 16.8-1.5-1.5a4 4 0 0 1 0-5.6l4-4a4 4 0 0 1 5.6 0l1.5 1.5a4 4 0 0 1 0 5.6l-4 4a4 4 0 0 1-5.6 0Z"/><path d="m8.5 8.5 7 7"/></> : null}
  </svg>;
}
