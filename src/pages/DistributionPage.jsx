import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import { ErrorBlock, PageHeading, managementEnabled, useResource, IconButton } from '../components/Controls.jsx';
import { requestJson, normalizeProviders } from '../api/client.js';
import { modelCatalog } from '../api/data.js';
import { providerInfo } from '../api/providers.js';

const PAGE_SIZE = 20;

/**
 * 下游分发 — decide which models the gateway publishes to downstream clients.
 *
 * Default mode is "全部发布": every enabled model appears in /v1/models and is
 * callable, exactly as before this page existed. Switching to "仅白名单" narrows
 * both surfaces at once — the list stops advertising unselected models AND calls
 * to them return 404 — so a client cannot reach a model the operator withheld.
 */
export function DistributionPage() {
  const distribution = useResource('/api/models/distribution');
  const builtIn = useResource('/api/models');
  const custom = useResource('/api/models/custom');
  const providers = useResource('/api/providers');
  const nodes = useResource('/api/provider-nodes');
  const disabled = useResource('/api/models/disabled');
  const combos = useResource('/api/combos');

  const [mode, setMode] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const deferredQuery = useDeferredValue(query);

  // Seed local state from the server once (and only once): later refreshes must
  // not clobber unsaved edits the user is in the middle of making.
  useEffect(() => {
    if (!distribution.data || mode !== null) return;
    setMode(distribution.data.mode === 'allowlist' ? 'allowlist' : 'all');
    setSelected(new Set(distribution.data.models || []));
  }, [distribution.data, mode]);

  const models = useMemo(() => {
    const directory = nodes.data?.nodes || [];
    const connections = normalizeProviders(providers.data || {});
    // A model is a distribution candidate only when it is actually publishable
    // today: enabled, and backed by an active connection. Publishing a dead
    // model would just hand clients a 404 they cannot explain.
    return modelCatalog(builtIn.data?.models, custom.data?.models, providers.data?.connections, directory, disabled.data?.disabled)
      .map(model => {
        const info = providerInfo(model.provider, directory);
        const connection = connections.find(item => item.prefix === model.provider || providerInfo(item.provider, directory, item).id === info.id);
        return { ...model, supplier: info, hasConnections: !!connection };
      })
      .filter(model => model.enabled && model.connected);
  }, [builtIn.data, custom.data, providers.data, nodes.data, disabled.data]);

  const suppliers = useMemo(
    () => [...new Map(models.map(model => [model.supplier.id, model.supplier.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [models]
  );

  const filtered = models.filter(model =>
    (!provider || model.supplier.id === provider) &&
    `${model.id} ${model.name} ${model.supplier.name}`.toLowerCase().includes(deferredQuery.toLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const pageModels = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const loading = distribution.loading || builtIn.loading || custom.loading || providers.loading || nodes.loading || disabled.loading || combos.loading;
  const loadError = distribution.error || builtIn.error || custom.error || providers.error || nodes.error || disabled.error;

  // Combos are published downstream as their own callable names, alongside the
  // provider models — surface them so the white list can include them.
  const comboChoices = (combos.data?.combos || [])
    .map(combo => combo.name)
    .filter(name => `${name}`.toLowerCase().includes(deferredQuery.toLowerCase()));

  const dirty = mode !== null && distribution.data &&
    (mode !== (distribution.data.mode || 'all') || !sameSet(selected, new Set(distribution.data.models || [])));

  function toggleModel(id) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleVisible(ids, checked) {
    setSelected(previous => {
      const next = new Set(previous);
      for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
      return next;
    });
  }
  async function save() {
    setBusy(true);
    setActionError('');
    try {
      await requestJson('/api/models/distribution', {
        method: 'PUT',
        body: JSON.stringify({ mode, models: [...selected] }),
      });
      setSavedAt(new Date());
      distribution.refresh();
    } catch (failure) { setActionError(failure.message); }
    finally { setBusy(false); }
  }

  const visibleIds = pageModels.map(model => model.id);
  const selectedVisible = visibleIds.filter(id => selected.has(id)).length;

  return <>
    <PageHeading title="下游分发" subtitle="我的网关 / 决定下游客户端能看到与调用哪些模型">
      <button className="button" disabled={loading} onClick={() => { distribution.refresh(); setMode(null); }}><Icon name="refresh"/>刷新</button>
      {managementEnabled && <button className="button primary" disabled={busy || loading || !dirty} onClick={save}><Icon name="check"/>{busy ? '正在保存…' : '保存分发设置'}</button>}
    </PageHeading>

    {loadError && <ErrorBlock message={`${loadError}${distribution.data ? ' · 显示上次数据' : ''}`} onRetry={() => { distribution.refresh(); builtIn.refresh(); custom.refresh(); providers.refresh(); nodes.refresh(); disabled.refresh(); }}/>}
    {actionError && <ErrorBlock message={actionError}/>}
    {savedAt && !actionError && <p className="success-message" role="status">分发设置已保存 · {savedAt.toLocaleTimeString('zh-CN', { hour12: false })}</p>}

    <section className="panel distribution-mode">
      <div className="panel-heading"><div><h2>分发模式</h2><p>控制下游 /v1/models 的内容与实际可调用范围</p></div><Icon name="globe"/></div>
      <div className="period-tabs" aria-label="分发模式">
        <button type="button" aria-pressed={mode === 'all'} className={mode === 'all' ? 'selected' : ''} disabled={busy || loading} onClick={() => setMode('all')}>全部发布</button>
        <button type="button" aria-pressed={mode === 'allowlist'} className={mode === 'allowlist' ? 'selected' : ''} disabled={busy || loading} onClick={() => setMode('allowlist')}>仅白名单</button>
      </div>
      <p className="inline-note">
        {mode === 'allowlist'
          ? `下游只会看到并调用选中的 ${selected.size} 个模型；未选中的模型调用将返回 404。`
          : '下游可以看到并调用网关上的全部模型，与开启此功能前一致。'}
      </p>
    </section>

    {mode === 'allowlist' && <section className="panel">
      <div className="panel-heading"><div><h2>白名单模型 <span className="heading-count">{selected.size}</span></h2><p>共 {models.length} 个可发布模型 · 已选 {selected.size} 个</p></div><Icon name="check"/></div>
      <div className="table-toolbar">
        <div className="filter-search"><Icon name="search"/><input aria-label="搜索模型" value={query} placeholder="搜索模型、供应商或路由 ID…" onChange={event => { setQuery(event.target.value); setPage(1); }}/></div>
        <select className="filter-select" aria-label="模型供应商" value={provider} onChange={event => { setProvider(event.target.value); setPage(1); }}><option value="">所有供应商</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      </div>
      <div className="upstream-selection">
        <label className="checkbox-filter"><input type="checkbox" aria-label="选择本页模型" disabled={busy || !visibleIds.length} checked={!!visibleIds.length && selectedVisible === visibleIds.length} onChange={event => toggleVisible(visibleIds, event.target.checked)}/>选择本页（{visibleIds.length}）</label>
        <span className="muted">已选 {selected.size} 个 · 显示 {filtered.length} 个</span>
      </div>
      <div className="table-shell"><table><caption className="sr-only">可下发的模型，勾选后下游才能看到并调用</caption>
        <thead><tr><th>选择</th><th>模型 / 路由 ID</th><th>供应商</th><th>上下文</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan="4" className="table-empty">正在加载模型…</td></tr> : pageModels.length ? pageModels.map(model => <tr key={model.id} className={selected.has(model.id) ? 'upstream-selected' : ''}>
          <td><input type="checkbox" aria-label={`发布 ${model.id}`} disabled={busy} checked={selected.has(model.id)} onChange={() => toggleModel(model.id)}/></td>
          <td><div className="model-name"><strong>{model.name}</strong><code>{model.id}</code></div></td>
          <td><div className="provider-link"><ProviderIcon provider={model.supplier.id}/><div><strong>{model.supplier.name}</strong><small>{model.supplier.custom ? '自定义节点' : '内置供应商'}</small></div></div></td>
          <td className="mono muted">{model.caps.contextWindow ? new Intl.NumberFormat('zh-CN').format(model.caps.contextWindow) : '—'}</td>
        </tr>) : <tr><td colSpan="4" className="table-empty">{models.length ? '没有匹配的模型' : '暂无可发布的模型'}</td></tr>}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length} 个模型</span><div className="pagination"><IconButton icon="back" label="上一页模型" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}/><span>{currentPage} / {pages}</span><IconButton icon="arrow" label="下一页模型" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}/></div></div>
      {comboChoices.length > 0 && <div className="combo-choices"><p className="inline-note">组合模型（下游以组合名调用）：</p><div className="row-actions">{comboChoices.map(name => <label key={name} className="checkbox-filter"><input type="checkbox" disabled={busy} checked={selected.has(name)} onChange={() => toggleModel(name)}/>{name}</label>)}</div></div>}
    </section>}

    <p className="inline-note">提示：白名单同时限制「列表展示」与「实际调用」。不在名单内的模型，下游即使知道模型 ID 也会收到 404。修改后需点击右上角「保存分发设置」生效。</p>
  </>;
}

function sameSet(first, second) {
  if (first.size !== second.size) return false;
  for (const value of first) if (!second.has(value)) return false;
  return true;
}
