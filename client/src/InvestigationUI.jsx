import { useEffect, useRef } from 'react';

// Keep keyboard navigation inside the open case panel and return to its opener.
export function useCaseDialog(ref, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus({ preventScroll: true });
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close.current(); }
      if (e.key !== 'Tab') return;
      const controls = [...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select, textarea, a[href], [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (!ref.current?.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); document.body.style.overflow = previousOverflow; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [ref]);
}

export function CaseImage({ src, title, expanded, onExpand, onCollapse }) {
  const button = useRef();
  useEffect(() => { if (expanded) button.current?.focus(); }, [expanded]);
  if (expanded) return <div className="case-image-expanded"><div className="case-image-toolbar"><span>{title}</span><button ref={button} className="case-button" onClick={onCollapse}>Back to case ↙</button></div><div className="case-image-scroll"><img src={src} alt={title} /></div><p>Scroll to inspect the full-size image.</p></div>;
  return <figure className="case-image"><button onClick={onExpand} aria-label={`Enlarge ${title}`}><img src={src} alt={title} /><span>Inspect full size ↗</span></button></figure>;
}
