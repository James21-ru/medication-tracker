import { type ReactNode, useLayoutEffect, useRef } from 'react';

export function FlowContent({ stepKey, children }: { stepKey?: number; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const previousStep = useRef(stepKey);

  useLayoutEffect(() => {
    const previous = previousStep.current;
    previousStep.current = stepKey;
    const element = content.current;
    if (previous === undefined || stepKey === undefined || previous === stepKey || !element?.animate) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reducedMotion?.matches) return;

    const offset = stepKey > previous ? 12 : -12;
    const animation = element.animate([
      { opacity: 0.68, transform: `translateX(${offset}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    const stopForReducedMotion = () => { if (reducedMotion?.matches) animation.cancel(); };
    reducedMotion?.addEventListener('change', stopForReducedMotion);
    return () => {
      animation.cancel();
      reducedMotion?.removeEventListener('change', stopForReducedMotion);
    };
  }, [stepKey]);

  return <div ref={content} key={stepKey} className="lc-sheet__content">{children}</div>;
}
