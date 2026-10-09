import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

let hoverDismissed = false;

export default function TokenDetails({ requestId, tokens }) {
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const value = name => typeof tokens[name] === 'number' ? tokens[name].toLocaleString('zh-CN') : '—';
  const total = typeof tokens.input === 'number' && typeof tokens.output === 'number' ? (tokens.input + tokens.output).toLocaleString('zh-CN') : '—';

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
  }, [open, tokens.input, tokens.output, tokens.cached]);

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
    <button ref={triggerRef} type="button" className="log-token-trigger" aria-label={`查看 Token 明细 ${requestId}`} aria-describedby={open ? tooltipId : undefined} onMouseEnter={hover} onMouseMove={show} onMouseLeave={leave} onFocus={show} onBlur={() => setOpen(false)} onClick={show}>
      <span className="log-token-lines">
        <span><Icon name="input"/><b className="value-input">{value('input')}</b></span>
        <span><Icon name="output"/><b className="value-output">{value('output')}</b></span>
      </span>
      <span className="log-token-cache"><Icon name="cache"/>{value('cached')}</span>
    </button>
    {open && createPortal(<div ref={tooltipRef} id={tooltipId} role="tooltip" className="token-details-tooltip" style={{ ...position, visibility: position ? 'visible' : 'hidden' }} onMouseEnter={hover} onMouseLeave={leave}>
      <strong>Token 明细</strong>
      <div><span><Icon name="input"/>输入 Token</span><b className="value-input">{value('input')}</b></div>
      <div><span><Icon name="output"/>输出 Token</span><b className="value-output">{value('output')}</b></div>
      <div><span><Icon name="cache"/>缓存读取 Token</span><b className="value-cache">{value('cached')}</b></div>
      <div><span><Icon name="tokens"/>总 Token</span><b>{total}</b></div>
    </div>, document.body)}
  </>;
}
