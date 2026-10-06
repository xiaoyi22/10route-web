import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { requestJson } from '../api/client.js';
import { providerInfo } from '../api/providers.js';
import { ErrorBlock, IconButton, Modal, PageHeading, managementEnabled, useResource } from '../components/Controls.jsx';

const fields = [['input', '输入'], ['output', '输出'], ['cached', '缓存读取'], ['cache_creation', '缓存写入'], ['reasoning', '推理']];
const price = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value) : '—';

function PriceEditor({ model, onClose, onSaved }) {
  const [provider, setProvider] = useState(model?.provider || '');
  const [name, setName] = useState(model?.name || '');
  const [values, setValues] = useState(Object.fromEntries(fields.map(([key]) => [key, model?.rates[key] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setError('');
    const rates = Object.fromEntries(fields.filter(([key]) => values[key] !== '' || typeof model?.rates[key] === 'number').map(([key]) => [key, values[key] === '' ? model.rates[key] : Number(values[key])]));
    if (!provider.trim() || !name.trim() || !Object.keys(rates).length || Object.values(rates).some(value => !Number.isFinite(value) || value < 0)) return setError('填写供应商、模型和至少一项有效的非负价格。');
    setBusy(true);
    try {
      await requestJson('/api/pricing', { method: 'PATCH', body: JSON.stringify({ [provider.trim()]: { [name.trim()]: rates } }) });
      onSaved('模型价格已保存'); onClose();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title={model ? '编辑模型价格' : '添加模型价格'} onClose={onClose} busy={busy}>
    <form className="editor-form" onSubmit={save}>
      <div className="admin-form-grid"><label>供应商 ID<input required value={provider} readOnly={!!model} onChange={event => setProvider(event.target.value)} placeholder="例如：openai"/></label><label>模型 ID<input required value={name} readOnly={!!model} onChange={event => setName(event.target.value)} placeholder="上游模型 ID"/></label></div>
      <p className="admin-hint">单位为美元 / 百万 Token。0 表示免费；留空保留现有设置。</p>
      <div className="admin-form-grid">{fields.map(([key, label]) => <label key={key}>{label}价格<input aria-label={`${label}价格`} type="number" min="0" step="any" value={values[key]} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} placeholder="未设置"/></label>)}</div>
      {error && <ErrorBlock message={error}/>}
      <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}><Icon name="check"/>{busy ? '正在保存…' : '保存价格'}</button></div>
    </form>
  </Modal>;
}

export function PricingPage() {
  const resource = useResource('/api/pricing');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const models = useMemo(() => Object.entries(resource.data || {}).flatMap(([provider, models]) => Object.entries(models || {}).map(([name, rates]) => ({ provider, name, rates }))), [resource.data]);
  const suppliers = [...new Set(models.map(model => model.provider))].sort();
  const filtered = models.filter(model => (!provider || model.provider === provider) && `${model.provider} ${model.name} ${providerInfo(model.provider).name}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  function saved(message) { setMessage(message); setError(''); resource.refresh(); }
  async function reset() {
    setBusy(true); setError('');
    try {
      await requestJson(`/api/pricing?provider=${encodeURIComponent(resetting.provider)}&model=${encodeURIComponent(resetting.name)}`, { method: 'DELETE' });
      setResetting(null); saved('已移除该模型的自定义价格，恢复默认计价');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title="模型价格" subtitle="管理输入、输出与缓存计价"><button className="button" disabled={resource.loading || busy} onClick={resource.refresh}><Icon name="refresh"/>刷新</button>{managementEnabled && <button className="button primary" onClick={() => setEditor({})}><Icon name="plus"/>添加价格</button>}</PageHeading>
    <div className="admin-summary"><div><span className="admin-eyebrow">计价目录</span><strong>{resource.data ? models.length : '—'} <small>个模型</small></strong></div><div><span className="admin-eyebrow">供应商</span><strong>{resource.data ? suppliers.length : '—'}</strong></div><p>美元 / 百万 Token<br/><span>用于网关费用估算，实际账单以供应商为准。</span></p></div>
    {resource.error && <ErrorBlock message={resource.error} onRetry={resource.refresh}/>}{error && !resetting && <ErrorBlock message={error}/>}{message && <p className="admin-success" role="status"><Icon name="check"/>{message}</p>}
    <div className="admin-toolbar"><div className="filter-search"><Icon name="search"/><input type="search" aria-label="搜索价格" placeholder="搜索模型或供应商…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></div><label className="admin-select">供应商<select aria-label="价格供应商" value={provider} onChange={event => { setProvider(event.target.value); setPage(1); }}><option value="">全部供应商</option>{suppliers.map(id => <option key={id} value={id}>{providerInfo(id).name} · {id}</option>)}</select></label></div>
    <div className="table-shell"><table className="admin-price-table"><caption className="sr-only">模型价格，每百万 Token 美元</caption><thead><tr><th>模型 / 供应商</th>{fields.map(([key, label]) => <th key={key}>{label}</th>)}{managementEnabled && <th>操作</th>}</tr></thead><tbody>{filtered.slice((currentPage - 1) * 25, currentPage * 25).map(model => <tr key={`${model.provider}/${model.name}`}><td><div className="model-name"><strong>{model.name}</strong><small>{providerInfo(model.provider).name} · {model.provider}</small></div></td>{fields.map(([key, label]) => <td className="mono" key={key} data-label={label}>{price(model.rates[key])}</td>)}{managementEnabled && <td><div className="row-actions"><IconButton icon="edit" label={`编辑价格 ${model.provider}/${model.name}`} onClick={() => setEditor(model)}/><IconButton icon="refresh" label={`恢复默认价格 ${model.provider}/${model.name}`} onClick={() => { setError(''); setResetting(model); }}/></div></td>}</tr>)}{!filtered.length && <tr><td colSpan="7" className="table-empty">{resource.loading ? '正在读取价格…' : resource.error ? '价格读取失败' : '暂无匹配的模型价格'}</td></tr>}</tbody></table></div>
    <div className="table-footer"><span>{filtered.length} 个模型 · 缺少价格显示 —</span><div className="pagination"><IconButton icon="back" label="上一页价格" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}/><span>{currentPage} / {pages}</span><IconButton icon="arrow" label="下一页价格" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}/></div></div>
    {editor && <PriceEditor model={editor.name ? editor : null} onClose={() => setEditor(null)} onSaved={saved}/>}
    {resetting && <Modal title="恢复默认价格" onClose={() => setResetting(null)} busy={busy}><p className="delete-message">移除 <strong>{resetting.provider}/{resetting.name}</strong> 的自定义价格？没有默认价格的模型将不再显示自定义计价。</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={() => setResetting(null)}>取消</button><button className="button primary" disabled={busy} onClick={reset}>{busy ? '正在恢复…' : '确认恢复默认'}</button></div></Modal>}
  </>;
}
