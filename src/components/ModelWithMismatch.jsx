import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { isModelMismatch } from '../api/data.js';

let hoverDismissed = false;

export default function ModelWithMismatch({ entry }) {
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const mismatch = isModelMismatch(entry);
  const requestedModel = entry?.model || '—';
  const responseModel = entry?.responseModel || '未知';

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
  }, [open]);

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

  return (
    <div className="log-model-container">
      <div className="log-model" title={requestedModel}>
        <strong>{requestedModel}</strong>
      </div>
      {mismatch && (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="model-mismatch-badge"
            aria-label={`模型不一致：请求 ${requestedModel}，实际返回 ${responseModel}`}
            aria-describedby={open ? tooltipId : undefined}
            onMouseEnter={hover}
            onMouseMove={show}
            onMouseLeave={leave}
            onFocus={show}
            onBlur={() => setOpen(false)}
            onClick={show}
          >
            <Icon name="warning" className="model-mismatch-icon" />
          </button>
          {open && createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="model-mismatch-tooltip"
              style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
              onMouseEnter={hover}
              onMouseLeave={leave}
            >
              <div className="mismatch-tooltip-title">
                <Icon name="warning" className="model-mismatch-icon" />
                <span>模型返回不一致</span>
              </div>
              <dl>
                <div>
                  <dt>请求模型</dt>
                  <dd><code className="model-mismatch-code requested">{requestedModel}</code></dd>
                </div>
                <div>
                  <dt>实际返回</dt>
                  <dd><code className="model-mismatch-code returned">{responseModel}</code></dd>
                </div>
              </dl>
              <div className="mismatch-tooltip-hint">上游响应返回的 model 标识与网关请求的目标模型不一致。</div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
