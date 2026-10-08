import { useEffect, useState } from 'react';
import { overviewSummary } from '../api/overview.js';

export function useOverviewActivity(enabled) {
  const [activity, setActivity] = useState({ data: null, updated: null, status: 'connecting' });
  useEffect(() => {
    let source;
    let timer;
    let disposed = false;
    let failures = 0;
    function stop() {
      clearTimeout(timer);
      source?.close();
      source = null;
    }
    function failed() {
      stop();
      if (disposed || !enabled || document.hidden || navigator.onLine === false) return;
      failures += 1;
      setActivity(previous => ({ ...previous, status: 'error' }));
      timer = setTimeout(connect, Math.min(5000 * 2 ** Math.min(failures - 1, 3), 30000));
    }
    function connect() {
      if (disposed || !enabled || document.hidden || navigator.onLine === false || source) return;
      clearTimeout(timer);
      setActivity(previous => ({ ...previous, status: 'connecting' }));
      const current = new EventSource('/api/usage/stream');
      source = current;
      timer = setTimeout(failed, 15000);
      current.onmessage = event => {
        if (disposed || source !== current) return;
        try {
          const payload = JSON.parse(event.data);
          if (!payload || typeof payload !== 'object' || overviewSummary(payload).activeCount === null) { failed(); return; }
          failures = 0;
          setActivity({ data: { activeRequests: payload.activeRequests, pending: payload.pending }, updated: new Date(), status: 'live' });
          clearTimeout(timer);
        } catch { failed(); }
      };
      current.onerror = () => { if (source === current) failed(); };
    }
    function wake() {
      if (!enabled || document.hidden || navigator.onLine === false) {
        stop();
        setActivity(previous => ({ ...previous, status: navigator.onLine === false ? 'offline' : 'paused' }));
      } else connect();
    }
    queueMicrotask(() => { if (!disposed) wake(); });
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('offline', wake);
    window.addEventListener('online', wake);
    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('offline', wake);
      window.removeEventListener('online', wake);
    };
  }, [enabled]);
  return activity;
}
