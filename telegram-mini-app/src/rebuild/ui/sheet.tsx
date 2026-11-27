import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { Icon } from './icons';
import { FlowContent } from './flow-motion';

type SheetEntry = { backdrop: HTMLDivElement; dialog: HTMLElement; body: HTMLDivElement; close: () => void; previousFocus: HTMLElement | null };
const sheets: SheetEntry[] = [];
let releasePage: (() => void) | null = null;
let releaseStackEvents: (() => void) | null = null;
let activeSheet: SheetEntry | undefined;
const hiddenByParent = (entry: SheetEntry) => {
  for (let parent = entry.backdrop.parentElement; parent; parent = parent.parentElement) {
    if (parent.hasAttribute('data-leaving')) return true;
    if (parent.inert && !sheets.some((item) => item.backdrop === parent)) return true;
  }
  return false;
};
const topSheet = () => [...sheets].reverse().find((entry) => entry.backdrop.isConnected && !hiddenByParent(entry));
const focusable = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((item) => item.tabIndex >= 0 && !item.matches(':disabled, [type="hidden"]') && !item.closest('[inert], [aria-hidden="true"]') && item.getClientRects().length > 0);

function refreshStack() {
  const top = topSheet();
  const previous = activeSheet;
  // Сначала делаем новое верхнее окно доступным и переводим фокус.
  // aria-hidden не должен включаться у родителя текущего focused элемента.
  for (const entry of sheets) {
    if (entry === top || entry.backdrop.contains(top?.backdrop ?? null)) {
      entry.backdrop.inert = false;
      entry.backdrop.setAttribute('aria-hidden', 'false');
    }
  }
  if (top && !top.dialog.contains(document.activeElement)) {
    const trigger = previous !== top ? previous?.previousFocus : null;
    if (trigger?.isConnected && top.dialog.contains(trigger) && !trigger.closest('[inert]') && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
    else top.dialog.focus({ preventScroll: true });
  } else if (!top && previous?.dialog.contains(document.activeElement)) {
    const trigger = previous.previousFocus;
    if (trigger?.isConnected && !trigger.closest('[inert], [data-leaving]')) trigger.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  activeSheet = top;
  for (const [index, entry] of sheets.entries()) {
    const inactive = entry !== top && !entry.backdrop.contains(top?.backdrop ?? null);
    if (entry.backdrop.inert !== inactive) entry.backdrop.inert = inactive;
    if (entry.backdrop.getAttribute('aria-hidden') !== String(inactive)) entry.backdrop.setAttribute('aria-hidden', String(inactive));
    entry.backdrop.style.zIndex = String(50 + index);
    entry.dialog.setAttribute('aria-modal', String(entry === top));
  }
}

function lockPage() {
  const body = document.body, html = document.documentElement;
  const x = window.scrollX, y = window.scrollY;
  const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, paddingRight: body.style.paddingRight, htmlOverflow: html.style.overflow };
  const gap = Math.max(0, window.innerWidth - html.clientWidth);
  if (gap) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gap}px`;
  body.style.overflow = 'hidden'; body.style.position = 'fixed';
  body.style.top = `-${y}px`; body.style.left = `-${x}px`; body.style.width = '100%';
  html.style.overflow = 'hidden';
  return () => {
    body.style.overflow = previous.overflow; body.style.position = previous.position;
    body.style.top = previous.top; body.style.left = previous.left; body.style.width = previous.width;
    body.style.paddingRight = previous.paddingRight; html.style.overflow = previous.htmlOverflow;
    window.scrollTo(x, y);
  };
}

function keepFieldVisible() {
  const top = topSheet(), active = document.activeElement;
  if (!top || !(active instanceof HTMLElement) || !top.body.contains(active) || !active.matches('input, select, textarea, [contenteditable="true"]')) return;
  const field = active.getBoundingClientRect(), body = top.body.getBoundingClientRect();
  const margin = 16;
  const start = body.top + margin, end = body.bottom - margin;
  const delta = field.height > end - start || field.top < start ? field.top - start : field.bottom > end ? field.bottom - end : 0;
  if (Math.abs(delta) > 1) top.body.scrollTop += delta;
}

function bindStackEvents() {
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; keepFieldVisible(); }); };
  const focus = () => { refreshStack(); schedule(); };
  const keydown = (event: KeyboardEvent) => {
    const top = topSheet();
    if (!top || event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); top.close(); return; }
    if (event.key !== 'Tab') return;
    const choices = focusable(top.dialog);
    const first = choices[0], last = choices[choices.length - 1];
    if (!first) { event.preventDefault(); top.dialog.focus({ preventScroll: true }); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === top.dialog || !top.dialog.contains(document.activeElement))) { event.preventDefault(); last.focus({ preventScroll: true }); }
    else if (!event.shiftKey && (document.activeElement === last || !top.dialog.contains(document.activeElement))) { event.preventDefault(); first.focus({ preventScroll: true }); }
  };
  const observer = new MutationObserver(() => { refreshStack(); schedule(); });
  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['inert', 'data-leaving'] });
  document.addEventListener('focusin', focus);
  document.addEventListener('keydown', keydown);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  return () => {
    observer.disconnect(); if (frame) cancelAnimationFrame(frame);
    document.removeEventListener('focusin', focus); document.removeEventListener('keydown', keydown);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
  };
}

export function Sheet({ title, onClose, children, footer, stepKey }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; stepKey?: number }) {
  const backdrop = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const previousStep = useRef(stepKey);
  useLayoutEffect(() => {
    let returnFocus = previousFocus.current;
    for (let index = sheets.length - 1; index >= 0; index -= 1) {
      const owner = sheets[index];
      if (returnFocus && owner.dialog.contains(returnFocus) && hiddenByParent(owner)) returnFocus = owner.previousFocus;
    }
    const entry: SheetEntry = { backdrop: backdrop.current!, dialog: dialog.current!, body: body.current!, close: () => close.current(), previousFocus: returnFocus };
    if (!sheets.length) { releasePage = lockPage(); releaseStackEvents = bindStackEvents(); }
    sheets.push(entry);
    refreshStack();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keepFieldVisible);
    resize?.observe(entry.body);
    return () => {
      resize?.disconnect();
      const index = sheets.indexOf(entry);
      if (index >= 0) sheets.splice(index, 1);
      if (!sheets.length) {
        activeSheet = undefined;
        releaseStackEvents?.(); releaseStackEvents = null;
        releasePage?.(); releasePage = null;
        if (entry.previousFocus?.isConnected && !entry.previousFocus.closest('[inert]')) entry.previousFocus.focus({ preventScroll: true });
      } else refreshStack();
    };
  }, []);
  useLayoutEffect(() => {
    if (previousStep.current === stepKey) return;
    previousStep.current = stepKey;
    if (body.current) body.current.scrollTop = 0;
    if (topSheet()?.dialog === dialog.current) dialog.current?.focus({ preventScroll: true });
  }, [stepKey]);
  return <div ref={backdrop} className="lc-sheet-backdrop" role="presentation">
    <div className="lc-sheet-scrim" aria-hidden="true" />
    <section ref={dialog} className="lc-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <div className="lc-sheet__handle" aria-hidden="true" />
      <header className="lc-sheet__header"><h2>{title}</h2><button className="lc-icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button></header>
      <div ref={body} className="lc-sheet__body"><FlowContent stepKey={stepKey}>{children}</FlowContent></div>
      {footer ? <footer className="lc-sheet__footer">{footer}</footer> : null}
    </section>
  </div>;
}
