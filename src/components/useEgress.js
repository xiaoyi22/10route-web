import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from '../api/client.js';
import { createEgressCache, egressBinding } from '../api/egress-cache.js';

const cache = createEgressCache({ request: requestJson, storage: () => window.sessionStorage });
if (typeof window !== 'undefined') {
  for (const name of ['tenrouter:unauthorized', 'tenrouter:logout']) window.addEventListener(name, () => cache.clear());
}

export function useEgress(entry, enabled, revision) {
  const binding = egressBinding(entry);
  const [state, setState] = useState(() => ({ binding, data: cache.read(entry), busy: false, error: '' }));
  const controls = useRef(null);
  const refresh = useCallback(() => controls.current?.(true), []);
  useEffect(() => {
    let disposed = false;
    let timer;
    let sequence = 0;
    function schedule() {
      clearTimeout(timer);
      if (disposed || !enabled || document.hidden || navigator.onLine === false) return;
      timer = setTimeout(() => load(false), Math.max(1000, cache.nextAt(entry) - Date.now()));
    }
    async function load(force) {
      clearTimeout(timer);
      if (disposed || document.hidden || navigator.onLine === false) return;
      const request = ++sequence;
      setState(previous => ({ binding, data: previous.binding === binding ? previous.data : cache.read(entry), busy: force || cache.busy(entry) || !!cache.retryAt(entry) || !cache.fresh(cache.read(entry)), error: '' }));
      try {
        const data = await cache.load(entry, { force, allowProbe: enabled });
        if (!disposed && request === sequence) setState(previous => ({ binding, data: data || (previous.binding === binding ? previous.data : null), busy: false, error: '' }));
      } catch (failure) {
        if (!disposed && request === sequence) setState(previous => ({ binding, data: previous.binding === binding ? previous.data : null, busy: false, error: failure.name === 'AbortError' ? '' : failure.message }));
      } finally { if (!disposed && request === sequence) schedule(); }
    }
    function visibilityChanged() {
      if (document.hidden || navigator.onLine === false) clearTimeout(timer);
      else load(false);
    }
    controls.current = load;
    queueMicrotask(() => { if (!disposed) load(false); });
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('online', visibilityChanged);
    return () => {
      disposed = true; clearTimeout(timer);
      if (controls.current === load) controls.current = null;
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('online', visibilityChanged);
    };
  }, [binding, enabled, revision]);
  const current = state.binding === binding ? state : { data: cache.read(entry), error: '', busy: false };
  return { ...current, refresh, stale: !!current.data && !cache.fresh(current.data) };
}
