import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

let hoverDismissed = false;

export default function RequestEndpoint({ requestId, entryEndpoint, upstreamEndpoint }) {
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const upstream = typeof upstreamEndpoint === 'string' && upstreamEndpoint.trim() ? upstreamEndpoint.trim() : '未记录';

  function show() {
    hoverDismissed = false;
    clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function hover() {
    if (!hoverDismissed) show();
  }

  function leave() {
    clearTimeout(closeTimer.current);
    if (document.activeElement === triggerRef.current) return;
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = triggerRef.current.getBoundingClientRect();
      const card = tooltipRef.current.getBoundingClientRect();
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - card.width - 12));
      const below = anchor.bottom + 8;
      const top = below + card.height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - card.height - 8);
      setPosition({ left, top });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, entryEndpoint, upstream]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const dismiss = event => {
      if (!triggerRef.current?.contains(event.target) && !tooltipRef.current?.contains(event.target)) close();
    };
    const keyboard = event => {
      if (event.key === 'Escape') {
        hoverDismissed = true;
        close();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', keyboard);
      clearTimeout(closeTimer.current);
    };
  }, [open]);

  return <>
    <button ref={triggerRef} type="button" className="log-endpoint-trigger" aria-label={'查看请求端点 ' + requestId} aria-describedby={open ? tooltipId : undefined} onMouseEnter={hover} onMouseMove={show} onMouseLeave={leave} onFocus={show} onBlur={() => setOpen(false)} onClick={show}>
      <span className="mono log-endpoint">{entryEndpoint}</span><Icon name="link"/>
    </button>
    {open && createPortal(<div ref={tooltipRef} id={tooltipId} role="tooltip" className="endpoint-tooltip" style={{ ...position, visibility: position ? 'visible' : 'hidden' }} onMouseEnter={hover} onMouseLeave={leave}>
      <dl>
        <div><dt>入口端点</dt><dd><code className="endpoint-badge entry">{entryEndpoint}</code></dd></div>
        <div><dt>出口端点</dt><dd>{upstream === '未记录' ? <span className="endpoint-unrecorded">{upstream}</span> : <code className="endpoint-badge upstream">{upstream}</code>}</dd></div>
      </dl>
    </div>, document.body)}
  </>;
}
