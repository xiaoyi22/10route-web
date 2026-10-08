import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from '../api/client.js';

export function useOverviewResource(url, interval, enabled) {
  const [state, setState] = useState({ url, data: null, error: '', updated: null, loading: true, offline: false, retryAt: null });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const controls = useRef(null);
  const refresh = useCallback(() => controls.current?.refresh(), []);
  useEffect(() => {
    let controller;
    let timer;
    let disposed = false;
    let requested = true;
    let explicit = false;
    let nextAt = 0;
    let failures = 0;
    setState(previous => previous.url === url ? previous : { url, data: null, error: '', updated: null, loading: true, offline: false, retryAt: null });
    function schedule() {
      clearTimeout(timer);
      if (disposed || controller || document.hidden || navigator.onLine === false || !enabledRef.current && !requested) return;
      timer = setTimeout(load, requested ? 0 : Math.max(0, nextAt - Date.now()));
    }
    async function load() {
      clearTimeout(timer);
      if (disposed || controller || document.hidden) return;
      if (navigator.onLine === false) {
        setState(previous => ({ ...previous, offline: true, loading: false }));
        return;
      }
      if (!requested && (!enabledRef.current || Date.now() < nextAt)) { schedule(); return; }
      explicit = requested;
      requested = false;
      const current = new AbortController();
      controller = current;
      const timeout = new AbortController();
      const deadline = setTimeout(() => timeout.abort(new DOMException('请求超时', 'TimeoutError')), 12000);
      setState(previous => ({ ...previous, loading: true, offline: false }));
      try {
        const data = await requestJson(url, { signal: AbortSignal.any([current.signal, timeout.signal]) });
        if (!disposed && !current.signal.aborted) {
          failures = 0;
          nextAt = Date.now() + interval;
          setState({ url, data, error: '', updated: new Date(), loading: false, offline: false, retryAt: null });
        }
      } catch (failure) {
        if (!disposed && !current.signal.aborted) {
          failures += 1;
          nextAt = Date.now() + Math.min(interval * 2 ** Math.min(failures, 4), 120000);
          setState(previous => ({ ...previous, error: failure.name === 'TimeoutError' ? '请求超时，请重试' : failure.message, loading: false, retryAt: nextAt }));
        }
      } finally {
        clearTimeout(deadline);
        if (controller === current) controller = null;
        schedule();
      }
    }
    function visibilityChanged() {
      if (document.hidden || navigator.onLine === false) {
        clearTimeout(timer);
        requested ||= !!controller && explicit;
        controller?.abort();
        setState(previous => ({ ...previous, loading: false, offline: navigator.onLine === false }));
      } else schedule();
    }
    function online() {
      setState(previous => ({ ...previous, offline: false }));
      if (enabledRef.current || requested) nextAt = 0;
      schedule();
    }
    const control = {
      refresh() {
        if (disposed || controller) return;
        requested = true;
        load();
      },
      configure: schedule,
    };
    controls.current = control;
    queueMicrotask(() => { if (!disposed) load(); });
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('offline', visibilityChanged);
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      if (controls.current === control) controls.current = null;
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('offline', visibilityChanged);
      window.removeEventListener('online', online);
    };
  }, [url, interval]);
  useEffect(() => { controls.current?.configure(); }, [enabled]);
  const current = state.url === url ? state : { url, data: null, error: '', updated: null, loading: true };
  return { ...current, refresh };
}
