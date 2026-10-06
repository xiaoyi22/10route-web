import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import { CopyButton, ErrorBlock, PageHeading, managementEnabled, useResource, IconButton } from '../components/Controls.jsx';
import { requestJson, normalizeProviders } from '../api/client.js';
import { modelCatalog } from '../api/data.js';
import { providerInfo } from '../api/providers.js';

const PAGE_SIZE = 20;

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
  const [view, setView] = useState('all');
  const [editing, setEditing] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!distribution.data || editing) return;
    setMode(distribution.data.mode === 'allowlist' ? 'allowlist' : 'all');
    setSelected(new Set(distribution.data.models || []));
  }, [distribution.data]);

  const models = useMemo(() => {
    const directory = nodes.data?.nodes || [];
    const connections = normalizeProviders(providers.data || {});
    return modelCatalog(builtIn.data?.models, custom.data?.models, providers.data?.connections, directory, disabled.data?.disabled)
      .map(model => {
        const info = providerInfo(model.provider, directory);
        const connection = connections.find(item => item.prefix === model.provider || providerInfo(item.provider, directory, item).id === info.id);
        return { ...model, supplier: info, hasConnections: !!connection };
      })
      .filter(model => model.enabled && model.connected);
  }, [builtIn.data, custom.data, providers.data, nodes.data, disabled.data]);

  const resources = [distribution, builtIn, custom, providers, nodes, disabled, combos];
  const loading = resources.some(item => item.loading);
  const initialLoading = resources.some(item => item.loading && !item.data);
  const loadError = resources.find(item => item.error)?.error;
  const choices = distribution.data?.catalog ? distribution.data.catalog.map(entry => {
    const model = models.find(model => model.id === entry.id);
    const combo = combos.data?.combos?.find(combo => combo.name === entry.id);
    return { ...model, id: entry.id, name: model?.name || entry.id, available: true, combo: !!combo, members: combo?.models || [], supplier: combo ? { id: '__combos__', name: '组合模型' } : model?.supplier || providerInfo(entry.owned_by || entry.id.split('/')[0], nodes.data?.nodes || []), caps: model?.caps || {} };
  }) : [...models.map(model => ({ ...model, available: true })), ...(combos.data?.combos || []).map(combo => ({ id: combo.name, name: combo.name, combo: true, members: combo.models, available: true, supplier: { id: '__combos__', name: '组合模型' }, caps: {} }))];
  const availableIds = new Set(choices.map(model => model.id));
  const missingIds = [...new Set([...selected, ...(distribution.data?.models || [])])].filter(id => !availableIds.has(id));
  const entries = [...choices, ...missingIds.map(id => ({ id, name: id, available: false, supplier: { id: '__missing__', name: '待核对模型' }, caps: {} }))];
  const publishes = model => model.available && (mode === 'all' || selected.has(model.id));
  const savedPublishes = model => model.available && (distribution.data?.mode !== 'allowlist' || (distribution.data.models || []).includes(model.id));
  const publishedCount = choices.filter(publishes).length;
  const savedCount = choices.filter(savedPublishes).length;
  const selectedModels = entries.filter(model => mode === 'all' ? model.available : selected.has(model.id));
  const added = choices.filter(model => publishes(model) && !savedPublishes(model)).length;
  const removed = choices.filter(model => !publishes(model) && savedPublishes(model)).length;
  const suppliers = [...new Map(entries.map(model => [model.supplier.id, model.supplier])).values()].map(supplier => {
    const items = entries.filter(model => model.supplier.id === supplier.id);
    return { ...supplier, total: items.length, published: items.filter(publishes).length };
  });
  const matches = entries.filter(model => (!provider || model.supplier.id === provider) && `${model.id} ${model.name} ${model.supplier.name}`.toLowerCase().includes(deferredQuery.toLowerCase()));
  const filtered = matches.filter(model => view === 'all' || (view === 'published' ? publishes(model) : !publishes(model)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const pageModels = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const dirty = mode !== null && distribution.data &&
    (mode !== (distribution.data.mode || 'all') || (mode === 'allowlist' && !sameSet(selected, new Set(distribution.data.models || []))));
  const locked = !managementEnabled || busy || loading || !!loadError || mode === null;

  function refresh() { resources.forEach(item => item.refresh()); }
  function changeMode(next) {
    if (next === mode) return;
    const nextSelected = next === 'allowlist' ? new Set(choices.map(model => model.id)) : selected;
    setMode(next);
    setSelected(nextSelected);
    setEditing(next !== distribution.data.mode || (next === 'allowlist' && !sameSet(nextSelected, new Set(distribution.data.models || []))));
    setSavedAt(null); setPage(1);
  }
  function discard() {
    setMode(distribution.data?.mode === 'allowlist' ? 'allowlist' : 'all');
    setSelected(new Set(distribution.data?.models || []));
    setActionError(''); setSavedAt(null); setEditing(false);
  }

  function toggleModel(id) {
    selectModels([id], !selected.has(id));
  }
  function selectModels(ids, checked) {
    setEditing(true); setSavedAt(null);
    setMode('allowlist');
    setSelected(previous => {
      const next = mode === 'all' ? new Set(choices.map(model => model.id)) : new Set(previous);
      for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
      return next;
    });
  }
  async function save() {
    if (locked || !dirty) return;
    setBusy(true);
    setActionError('');
    try {
      const persisted = await requestJson('/api/models/distribution', {
        method: 'PUT',
        body: JSON.stringify({ mode, models: [...selected] }),
      });
      setMode(persisted.mode);
      setSelected(new Set(persisted.models));
      setEditing(false);
      setSavedAt(new Date());
      distribution.refresh();
    } catch (failure) { setActionError(failure.message); }
    finally { setBusy(false); }
  }

  const visibleIds = pageModels.filter(model => model.available).map(model => model.id);
  const selectedVisible = visibleIds.filter(id => selected.has(id)).length;
  const filteredIds = filtered.filter(model => model.available).map(model => model.id);
  const selectedFiltered = filteredIds.filter(id => selected.has(id)).length;

  return <>
    <PageHeading title="下游分发" subtitle="我的网关 / 下游模型清单">
      <Link className="button" to="/dashboard/endpoint"><Icon name="link"/>客户端接入</Link>
      <button className="button refresh-button" aria-label="刷新" aria-busy={loading} disabled={loading || busy} onClick={refresh}><Icon name="refresh"/>{loading ? '更新中…' : '刷新'}</button>
    </PageHeading>

    {loadError && <ErrorBlock message={`${loadError}${distribution.data ? ' · 显示上次数据' : ''}`} onRetry={refresh}/>}
    {actionError && <ErrorBlock message={actionError}/>}
    {!initialLoading && distribution.data && !distribution.data.catalog && <p className="inline-note">动态模型暂未加载，当前仅显示已登记模型。</p>}
    {savedAt && !dirty && !actionError && <p className="success-message" role="status">分发设置已保存 · {savedAt.toLocaleTimeString('zh-CN', { hour12: false })}</p>}

    <section className="distribution-overview" aria-label="分发概况">
      <div className="distribution-live"><span className="muted">当前生效</span><strong>{distribution.data ? distribution.data.mode === 'allowlist' ? '指定模型' : '全部发布' : '正在读取…'}</strong><span className="status healthy"><span className="dot"/>{initialLoading || !distribution.data ? '—' : savedCount} 个模型</span></div>
      <div className="distribution-counts"><span>可发布 <strong>{initialLoading || !distribution.data ? '—' : choices.length}</strong></span><span>组合模型 <strong>{combos.data?.combos?.length ?? '—'}</strong></span><span className="badge subdued">{managementEnabled ? '管理访问' : '只读'}</span></div>
      <div className="distribution-mode-control"><span>发布范围</span><div className="distribution-segment" role="group" aria-label="分发模式"><button type="button" aria-pressed={mode === 'all'} disabled={locked} onClick={() => changeMode('all')}>全部发布</button><button type="button" aria-pressed={mode === 'allowlist'} disabled={locked} onClick={() => changeMode('allowlist')}>指定模型</button></div>{dirty && <span className="distribution-draft">未保存</span>}</div>
      <p className="distribution-policy">所有下游共用这份清单。{mode === 'all' ? '全部发布包含以后新增的模型；移除模型或清空清单会切换为指定模型。' : '只允许调用选中的模型；取消发布后禁止直接调用，新导入模型需要手动选择。'}</p>
    </section>

    <div className="distribution-workspace">
      <aside className="distribution-suppliers" aria-label="供应商分组"><h2>供应商</h2><button type="button" aria-pressed={!provider} onClick={() => { setProvider(''); setPage(1); }}><Icon name="grid"/><span>全部模型</span><small>{initialLoading ? '—' : choices.length}</small></button>{suppliers.map(supplier => <button key={supplier.id} type="button" aria-pressed={provider === supplier.id} onClick={() => { setProvider(supplier.id); setPage(1); }}>{supplier.id.startsWith('__') ? <Icon name={supplier.id === '__combos__' ? 'link' : 'activity'}/> : <ProviderIcon provider={supplier.id}/>}<span>{supplier.name}</span><small>{supplier.published} / {supplier.total}</small></button>)}</aside>
      <section className="distribution-list" aria-label="下游模型清单">
        <div className="distribution-list-heading"><h2>{suppliers.find(supplier => supplier.id === provider)?.name || '全部模型'}<span className="heading-count">{initialLoading ? '—' : matches.length}</span></h2><span className="muted">{dirty ? '待保存范围' : '当前发布范围'}</span></div>
        <div className="table-toolbar"><div className="filter-search"><Icon name="search"/><input aria-label="搜索分发模型" value={query} placeholder="搜索模型名称或下游模型 ID…" onChange={event => { setQuery(event.target.value); setPage(1); }}/></div><select className="filter-select distribution-mobile-suppliers" aria-label="模型供应商" value={provider} onChange={event => { setProvider(event.target.value); setPage(1); }}><option value="">全部模型</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name} ({supplier.total})</option>)}</select></div>
        <div className="distribution-view-tabs" role="group" aria-label="发布状态筛选">{[['all', '全部', matches.length], ['published', dirty ? '将发布' : '已发布', matches.filter(publishes).length], ['withheld', '未发布', matches.filter(model => !publishes(model)).length]].map(([id, label, count]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => { setView(id); setPage(1); }}>{label}<span>{initialLoading ? '—' : count}</span></button>)}</div>
        {mode === 'allowlist' && <div className="distribution-bulk"><label className="checkbox-filter"><input type="checkbox" aria-label="选择本页模型" disabled={locked || !visibleIds.length} checked={!!visibleIds.length && selectedVisible === visibleIds.length} ref={input => { if (input) input.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length; }} onChange={event => selectModels(visibleIds, event.target.checked)}/>全选本页（{visibleIds.length}）</label><div className="distribution-bulk-actions"><button type="button" className="text-button" disabled={locked || selectedFiltered === filteredIds.length} onClick={() => selectModels(filteredIds, true)}>选择筛选结果（{filteredIds.length}）</button><button type="button" className="text-button" disabled={locked || !selectedFiltered} onClick={() => selectModels(filteredIds, false)}>取消筛选结果（{filteredIds.length}）</button></div></div>}
        <div className="table-shell"><table className="distribution-table"><caption className="sr-only">下游模型发布清单</caption><thead><tr>{mode === 'allowlist' && <th className="distribution-select-column">发布</th>}<th>模型 / 下游模型 ID</th><th className="distribution-source-column">来源供应商</th><th className="distribution-state-column">发布状态</th><th className="distribution-copy-column">复制 ID</th></tr></thead><tbody>{initialLoading ? <tr><td colSpan={mode === 'allowlist' ? 5 : 4} className="table-empty">正在读取真实模型…</td></tr> : pageModels.map(model => {
          const published = publishes(model);
          const changed = published !== savedPublishes(model);
          return <tr key={model.id} data-model-id={model.id}>{mode === 'allowlist' && <td className="distribution-checkbox"><input type="checkbox" aria-label={`发布 ${model.id}`} disabled={locked} checked={selected.has(model.id)} onChange={() => toggleModel(model.id)}/></td>}<td><div className="model-name"><strong>{model.name}</strong><code>{model.id}</code><small className="distribution-mobile-source">{model.supplier.name}</small>{model.combo && <small className="distribution-member-count">{model.members.length} 个成员</small>}</div></td><td className="distribution-source-column"><div className="provider-link">{model.combo || !model.available ? <Icon name={model.combo ? 'link' : 'activity'}/> : <ProviderIcon provider={model.supplier.id}/>}<span>{model.supplier.name}</span></div></td><td className="distribution-state-column"><span className={`distribution-state ${!model.available ? 'unknown' : changed ? 'pending' : published ? 'published' : 'withheld'}`}><span className="dot"/>{!model.available ? '待核对' : changed ? published ? '待发布' : '待取消' : published ? '已发布' : '未发布'}</span></td><td className="distribution-copy-column"><CopyButton value={model.id} label={`复制下游模型 ID ${model.id}`}/></td></tr>;
        })}{!initialLoading && !pageModels.length && <tr><td colSpan={mode === 'allowlist' ? 5 : 4} className="table-empty">{entries.length ? '没有匹配的模型' : '暂无可发布模型'}</td></tr>}</tbody></table></div>
        <div className="table-footer"><span>{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} / ${filtered.length}` : '0 个模型'}</span><div className="pagination"><IconButton icon="back" label="上一页模型" disabled={loading || currentPage <= 1} onClick={() => setPage(currentPage - 1)}/><span>{currentPage} / {pages}</span><IconButton icon="arrow" label="下一页模型" disabled={loading || currentPage >= pages} onClick={() => setPage(currentPage + 1)}/></div></div>
      </section>
      <aside className="distribution-selected" aria-label="已选发布清单">
        <div className="distribution-selected-heading"><h2>{dirty ? '待发布清单' : '发布清单'}<span className="heading-count">{initialLoading || !distribution.data ? '—' : selectedModels.length}</span></h2>{managementEnabled && <button type="button" className="text-button" disabled={locked || !selectedModels.length} onClick={() => selectModels(selectedModels.map(model => model.id), false)}>清空清单</button>}</div>
        <p className="muted">已选模型，可直接移除。</p>
        {initialLoading ? <p className="empty-state">正在读取…</p> : selectedModels.length ? <ul>{selectedModels.map(model => <li key={model.id} data-selected-model-id={model.id}><div><strong title={model.name}>{model.name}</strong>{model.name !== model.id && <code title={model.id}>{model.id}</code>}<small>{model.available ? model.supplier.name : '暂不可用 · 保留原配置'}</small></div>{managementEnabled && <IconButton icon="close" label={`移除发布模型 ${model.id}`} disabled={locked} onClick={() => selectModels([model.id], false)}/>}</li>)}</ul> : <p className="distribution-empty" role="status">{loadError ? '模型清单读取失败' : '未选择任何模型，保存后将禁止全部下游模型调用。'}</p>}
        <p className="distribution-combo-note">组合模型独立发布；成员用于内部路由，需单独发布后才能被下游调用。</p>
      </aside>
    </div>
    <div className="distribution-savebar"><div><strong>{dirty ? `保存后发布 ${publishedCount} 个模型` : `当前发布 ${initialLoading || !distribution.data ? '—' : savedCount} 个模型`}</strong><span className={dirty ? 'distribution-draft' : 'muted'}>{dirty ? `新增 ${added} · 取消 ${removed}${missingIds.length ? ` · 待核对 ${missingIds.length}` : ''}` : loading ? '正在读取…' : loadError ? '读取失败' : '配置已同步'}</span></div>{managementEnabled && <div className="distribution-save-actions"><button type="button" className="button" disabled={busy || !dirty} onClick={discard}>撤销更改</button><button type="button" className="button primary" disabled={locked || !dirty} onClick={save}><Icon name="check"/>{busy ? '正在保存…' : '保存分发设置'}</button></div>}</div>
  </>;
}

function sameSet(first, second) {
  if (first.size !== second.size) return false;
  for (const value of first) if (!second.has(value)) return false;
  return true;
}
