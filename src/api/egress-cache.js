export const EGRESS_TTL = 300000;
export const EGRESS_STORAGE_KEY = 'tenrouter.egress.v1';
const storageKey = EGRESS_STORAGE_KEY;

export function egressBinding(entry) {
  return JSON.stringify([Number(entry.port), entry.group || '', entry.chain || []]);
}

export function createEgressCache({ request, storage, now = Date.now } = {}) {
  const records = new Map();
  const active = new Map();
  const jobs = new Map();
  const failures = new Map();
  const target = () => typeof storage === 'function' ? storage() : storage;
  try {
    const saved = JSON.parse(target()?.getItem(storageKey) || 'null');
    if (saved?.version === 1 && Array.isArray(saved.records)) {
      for (const record of saved.records) {
        if ([7890, 7891, 7892].includes(record.port) && typeof record.binding === 'string' && typeof record.data?.ip === 'string') records.set(record.port, record);
      }
    }
  } catch {}
  function persist() {
    try { target()?.setItem(storageKey, JSON.stringify({ version: 1, records: [...records.values()] })); } catch {}
  }
  function read(entry) {
    const record = records.get(Number(entry.port));
    return record?.binding === egressBinding(entry) ? record.data : null;
  }
  function fresh(data) {
    const checked = Date.parse(data?.checked_at);
    return !!data?.ip && Number.isFinite(checked) && checked <= now() + 60000 && now() - checked < EGRESS_TTL;
  }
  function activate(entry) {
    const port = Number(entry.port);
    const binding = egressBinding(entry);
    if (active.get(port)?.binding !== binding) {
      active.set(port, { binding });
      if (records.get(port)?.binding !== binding) { records.delete(port); persist(); }
    }
    return active.get(port);
  }
  async function load(entry, { force = false, allowProbe = true } = {}) {
    const port = Number(entry.port);
    const binding = egressBinding(entry);
    const owner = activate(entry);
    const pending = jobs.get(binding);
    if (pending?.owner === owner) return pending.promise;
    const failure = failures.get(binding);
    if (!force && failure?.retryAt > now()) throw failure.error;
    if (!force && !failure && fresh(read(entry))) return read(entry);
    const job = { owner, promise: null };
    job.promise = (async () => {
      let result;
      if (!force && !failure) {
        result = await request('/api/hermes/egress-ip?port=' + port + '&binding=' + encodeURIComponent(binding), { signal: AbortSignal.timeout(50000) });
        if (result?.cache_binding !== binding || !fresh(result)) result = null;
      }
      if (active.get(port) !== owner) throw new DOMException('节点已变化，忽略旧检测结果', 'AbortError');
      if (!result && allowProbe) result = await request('/api/hermes/egress-ip', { method: 'POST', body: JSON.stringify({ port, binding }), signal: AbortSignal.timeout(50000) });
      if (active.get(port) !== owner) throw new DOMException('节点已变化，忽略旧检测结果', 'AbortError');
      if (!result && !allowProbe) return read(entry);
      if (!result?.ip || result.cache_binding !== binding) throw new Error('出口检测未返回当前节点的有效结果');
      const data = { ...result, checked_at: result.checked_at || new Date(now()).toISOString() };
      records.set(port, { port, binding, data });
      failures.delete(binding);
      persist();
      return data;
    })().catch(error => {
      if (active.get(port) === owner && error.name !== 'AbortError') {
        const count = (failures.get(binding)?.count || 0) + 1;
        failures.set(binding, { error, count, retryAt: now() + Math.min(5000 * 2 ** Math.min(count - 1, 4), 60000) });
      }
      throw error;
    }).finally(() => { if (jobs.get(binding) === job) jobs.delete(binding); });
    jobs.set(binding, job);
    return job.promise;
  }
  return {
    read, load, fresh,
    busy: entry => !!jobs.get(egressBinding(entry)),
    retryAt: entry => failures.get(egressBinding(entry))?.retryAt || 0,
    nextAt: entry => failures.get(egressBinding(entry))?.retryAt || Date.parse(read(entry)?.checked_at) + EGRESS_TTL || now(),
    clear() {
      records.clear(); active.clear(); jobs.clear(); failures.clear();
      try { target()?.removeItem(storageKey); } catch {}
    },
  };
}
