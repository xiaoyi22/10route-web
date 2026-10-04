import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { requestJson } from '../api/client.js';

export const managementEnabled = __MANAGEMENT_ENABLED__;
export const formatNumber = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('zh-CN').format(value) : '—';
export const formatDate = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';

export function PageHeading({ title, subtitle, children }) {
  return <div className="page-heading"><div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div><div className="heading-actions">{children}</div></div>;
}

export function ErrorBlock({ message, onRetry }) {
  return <div role="alert" className="error-block"><span>{message}</span>{onRetry && <button type="button" className="text-button" onClick={onRetry}>重试</button>}</div>;
}

export function useResource(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [updated, setUpdated] = useState(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!url) { setData(null); setError(''); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    requestJson(url, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setData(result); setUpdated(new Date()); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, revision]);
  return { data, loading, error, updated, refresh };
}

export function IconButton({ icon, label, ...props }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon name={icon}/></button>;
}

export function CopyButton({ value, label = '复制' }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(event) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const focused = document.activeElement;
        const text = document.createElement('textarea');
        text.value = value;
        text.readOnly = true;
        text.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        (event.currentTarget.closest('dialog') || document.body).appendChild(text);
        try {
          text.select();
          if (!document.execCommand('copy')) throw new Error('复制失败');
        } finally {
          text.remove();
          focused?.focus({ preventScroll: true });
        }
      }
      setCopied(true);
      setError(false);
    } catch { setError(true); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopied(false); setError(false); }, 2500);
  }
  return <span className="copy-control"><IconButton icon={copied ? 'check' : 'copy'} label={copied ? '已复制' : label} disabled={!value} onClick={copy}/>{error && <span className="error-message" role="alert">复制失败</span>}</span>;
}

export function Modal({ title, onClose, busy = false, className = '', children }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current.open) ref.current.showModal(); }, []);
  return <dialog ref={ref} className={`form-dialog${className ? ` ${className}` : ''}`} aria-labelledby="form-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === ref.current && !busy) onClose(); }}>
    <div className="dialog-top"><h2 id="form-dialog-title">{title}</h2><IconButton icon="close" label="关闭窗口" disabled={busy} onClick={onClose}/></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

export function ConfirmDelete({ title, name, url, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try { await requestJson(url, { method: 'DELETE' }); onDeleted(); onClose(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={title} onClose={onClose} busy={busy}><p className="delete-message">确定删除 <strong>{name}</strong>？此操作无法撤销。</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>取消</button><button className="button danger" disabled={busy} onClick={remove}><Icon name="trash"/>{busy ? '正在删除…' : '确认删除'}</button></div></Modal>;
}
