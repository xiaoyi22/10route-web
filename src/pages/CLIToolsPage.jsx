import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProviderIcon from '../components/ProviderIcon.jsx';
import { CopyButton, ErrorBlock, IconButton, Modal, PageHeading, managementEnabled, useResource } from '../components/Controls.jsx';
import { useGatewayModels } from '../components/useGatewayModels.js';
import { requestJson } from '../api/client.js';
import { cliPayload, cliTools, multiModelTools } from '../api/cli-tools.js';

function ModelChoice({ label, value, onChange, models, required = false }) {
  return <label>{label}<select aria-label={label} value={value} required={required} onChange={event => onChange(event.target.value)}><option value="">{required ? '选择已发布模型' : '使用默认模型'}</option>{value && !models.some(model => model.id === value) && <option value={value}>{value}（当前配置）</option>}{models.map(model => <option key={model.id} value={model.id}>{model.id}{model.combo ? ' · 组合' : ''}</option>)}</select></label>;
}

function ToolProfiles({ tool, form, payload, onLoad }) {
  const resource = useResource(`/api/cli-tools/${tool}-profiles`);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);
  const [editing, setEditing] = useState(null);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = tool === 'codex' ? { name, model: form.model } : { ...payload, name, ...(editing ? { id: editing.id } : {}) };
      await requestJson(`/api/cli-tools/${tool}-profiles`, { method: 'POST', body: JSON.stringify(body) });
      setName(''); setEditing(null); resource.refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await requestJson(`/api/cli-tools/${tool}-profiles${tool === 'claude' ? `?id=${encodeURIComponent(removing.id)}` : ''}`, { method: 'DELETE', ...(tool === 'codex' ? { body: JSON.stringify({ name: removing.name }) } : {}) }); setRemoving(null); resource.refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="admin-settings-panel"><div className="admin-section-heading"><h2>配置档案</h2><p>{tool === 'codex' ? '保存模型档案并复制启动命令。' : '保存当前表单的模型档位与接入设置，载入后可应用。'}</p></div>{(resource.error || error) && <ErrorBlock message={resource.error || error}/>}<div className="cli-profile-list">{(resource.data?.profiles || []).map(profile => <div className="cli-profile" key={profile.id || profile.name}><div><strong>{profile.name}</strong><small>{tool === 'codex' ? profile.model : profile.env?.ANTHROPIC_DEFAULT_SONNET_MODEL || '模型组合'}</small></div>{tool === 'codex' && <CopyButton value={profile.command} label={`复制启动命令 ${profile.name}`}/>}<button className="text-button" onClick={() => { setEditing(profile); setName(profile.name); onLoad(profile); }}>载入</button>{managementEnabled && <IconButton icon="trash" label={`删除配置档案 ${profile.name}`} onClick={() => setRemoving(profile)}/>}</div>)}</div>{managementEnabled && <form className="editor-form" onSubmit={save}><label>档案名称<input required maxLength={tool === 'codex' ? 64 : 40} pattern={tool === 'codex' ? '[a-zA-Z0-9_\\-]+' : undefined} value={name} onChange={event => setName(event.target.value)} placeholder={tool === 'codex' ? '字母、数字、短横线或下划线' : '例如：日常开发'}/></label><div className="dialog-actions"><button className="button" type="button" onClick={() => { setEditing(null); setName(''); }}>清空</button><button className="button primary" disabled={busy || !form.model || (tool === 'claude' && !payload)}>{editing ? '更新档案' : '保存当前配置为档案'}</button></div></form>}{removing && <Modal title="删除配置档案" busy={busy} onClose={() => setRemoving(null)}><p className="delete-message">删除 {removing.name}？</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" onClick={() => setRemoving(null)} disabled={busy}>取消</button><button className="button danger" onClick={remove} disabled={busy}>确认删除</button></div></Modal>}</section>;
}

function ToolSettings({ tool, models, onRefresh }) {
  const resource = useResource(`/api/cli-tools/${tool}-settings`);
  const keys = useResource('/api/keys');
  const [form, setForm] = useState({ baseUrl: __MODEL_BASE_URL__ || '', keyId: '', model: '', models: [], opus: '', sonnet: '', haiku: '', subagent: '', context: '', exa: false, roles: {}, plugins: [], localPlugins: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('');
  const status = resource.data;
  const initialized = useRef(false);
  useEffect(() => {
    if (!status || !keys.data || initialized.current) return;
    initialized.current = true;
    const env = status.settings?.env || {};
    const currentKey = keys.data.keys?.find(key => key.key === env.ANTHROPIC_AUTH_TOKEN);
    setForm(previous => ({ ...previous,
      ...(tool === 'claude' ? { baseUrl: env.ANTHROPIC_BASE_URL || previous.baseUrl, keyId: currentKey?.id || '', model: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '', opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || '', sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '', haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '', context: env.CLAUDE_CODE_MAX_CONTEXT_TOKENS || '', exa: status.exaMcpEnabled === true } : {}),
      ...(tool === 'hermes' ? { baseUrl: status.settings?.model?.base_url || previous.baseUrl, model: status.settings?.model?.model || '', roles: { ...(status.settings?.delegation?.model ? { delegation: status.settings.delegation.model } : {}), ...Object.fromEntries(Object.entries(status.settings?.auxiliary || {}).map(([role, data]) => [role, data.model || ''])) } } : {}),
      ...(tool === 'cowork' ? { plugins: (status.cowork?.plugins || []).map(plugin => plugin.name), localPlugins: status.cowork?.localPlugins || [] } : {}),
    }));
  }, [status, keys.data, tool]);
  const set = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); setMessage(''); };
  const apiKey = keys.data?.keys?.find(key => key.id === form.keyId)?.key;
  const payload = apiKey && form.baseUrl && form.model ? cliPayload(tool, form, apiKey, status) : null;
  async function apply() {
    setBusy(true); setError(''); setMessage('');
    try { await requestJson(`/api/cli-tools/${tool}-settings`, { method: confirm === 'remove' ? 'DELETE' : 'POST', ...(confirm === 'remove' ? {} : { body: JSON.stringify(payload) }) }); setConfirm(''); setMessage(confirm === 'remove' ? '已移除客户端中的网关配置' : '客户端配置已写入服务器'); resource.refresh(); onRefresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function loadProfile(profile) {
    if (tool === 'codex') return set('model', profile.model);
    const env = profile.env || {};
    const key = keys.data?.keys?.find(key => key.key === env.ANTHROPIC_AUTH_TOKEN);
    setForm(previous => ({ ...previous, baseUrl: env.ANTHROPIC_BASE_URL || previous.baseUrl, keyId: key?.id || '', model: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '', sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '', opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || '', haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '', context: profile.maxContextTokens || '', exa: profile.exaMcpEnabled === true }));
  }
  const title = cliTools.find(([id]) => id === tool)?.[1] || tool;
  if (tool === 'devin') return <section className="admin-settings-panel"><h2>Devin 原生登录</h2><p className="admin-hint">{status?.installed ? `已检测到 Devin ${status.version || ''}` : '网关服务器未检测到 Devin。'}该工具由自身管理认证，没有网关配置写入接口。</p><div className="admin-toolbar"><code>devin auth login</code><CopyButton value="devin auth login" label="复制 Devin 登录命令"/></div>{resource.error && <ErrorBlock message={resource.error}/>}</section>;
  return <>
    <section className="admin-settings-panel"><div className="admin-section-heading"><h2>{title} 配置</h2><p>写入网关服务器上的客户端配置。当前状态：{resource.loading ? '正在读取' : status?.installed ? status.has10Router ? '已配置网关' : '已检测到客户端或配置，未接入网关' : '未检测到客户端'}</p><p className="mono">{status?.configPath || status?.settingsPath || status?.globalStatePath || status?.authPath || ''}</p></div>{[resource.error, keys.error, error].filter(Boolean).map((message, index) => <ErrorBlock key={index} message={message}/>)}{message && <p className="admin-success" role="status">{message}</p>}
      <form className="editor-form" aria-label={`${title} 客户端配置`} onSubmit={event => { event.preventDefault(); setConfirm('apply'); }}><fieldset className="admin-fieldset" disabled={!managementEnabled || busy || resource.loading || !!resource.error}>
        <label>网关地址<input type="url" required value={form.baseUrl} onChange={event => set('baseUrl', event.target.value)}/></label>
        <label>网关密钥<select aria-label="网关密钥" required value={form.keyId} onChange={event => set('keyId', event.target.value)}><option value="">选择已启用密钥</option>{(keys.data?.keys || []).filter(key => key.isActive !== false).map(key => <option key={key.id} value={key.id}>{key.name}</option>)}</select></label>
        <ModelChoice label="主模型" value={form.model} onChange={value => set('model', value)} models={models} required/>
        {multiModelTools.has(tool) && <label>额外模型<select aria-label="额外模型" multiple className="cli-model-multi" value={form.models} onChange={event => set('models', [...event.target.selectedOptions].map(option => option.value))}>{models.map(model => <option key={model.id} value={model.id}>{model.id}</option>)}</select><small className="admin-hint">主模型会自动包含；可多选其他可用模型。</small></label>}
        {tool === 'claude' && <><div className="admin-form-grid">{[['opus', 'Opus 档位'], ['sonnet', 'Sonnet 档位'], ['haiku', 'Haiku 档位']].map(([key, label]) => <ModelChoice key={key} label={label} value={form[key]} onChange={value => set(key, value)} models={models}/>)}</div><label className="checkbox-filter"><input type="checkbox" checked={form.exa} onChange={event => set('exa', event.target.checked)}/>启用 Exa 工具服务</label></>}
        {['codex', 'opencode'].includes(tool) && <ModelChoice label="子任务模型" value={form.subagent} onChange={value => set('subagent', value)} models={models}/>}
        {['claude', 'grok-build'].includes(tool) && <label>上下文上限（可选）<input aria-label="上下文上限" type="number" min="1" max="9999999" value={form.context} onChange={event => set('context', event.target.value)}/></label>}
        {['hermes', 'openclaw', 'grok-build'].includes(tool) && <div className="cli-role-settings"><h3>角色模型</h3>{Object.entries(form.roles).map(([name, value]) => <div className="cli-role-row" key={name}><ModelChoice label={`角色 ${name}`} value={value} onChange={value => set('roles', { ...form.roles, [name]: value })} models={models}/><IconButton icon="trash" label={`移除角色 ${name}`} onClick={() => set('roles', Object.fromEntries(Object.entries(form.roles).filter(([key]) => key !== name)))}/></div>)}<div className="admin-toolbar"><label>角色名称<input aria-label="角色名称" value={role} onChange={event => setRole(event.target.value)} placeholder={tool === 'hermes' ? '例如：delegation 或 vision' : '填写现有角色 ID'}/></label><button className="button" type="button" disabled={!/^[a-zA-Z0-9_-]+$/.test(role) || role === 'default'} onClick={() => { set('roles', { ...form.roles, [role]: '' }); setRole(''); }}>添加角色</button></div></div>}
        {tool === 'cowork' && <div className="cli-role-settings"><h3>工具插件</h3>{(status?.defaultPlugins || []).map(plugin => <label className="checkbox-filter" key={plugin.name}><input type="checkbox" checked={form.plugins.includes(plugin.name)} onChange={event => set('plugins', event.target.checked ? [...form.plugins, plugin.name] : form.plugins.filter(name => name !== plugin.name))}/>{plugin.name}</label>)}{(status?.localStdioPlugins || []).map(plugin => <label className="checkbox-filter" key={plugin.name}><input type="checkbox" checked={form.localPlugins.includes(plugin.name)} onChange={event => set('localPlugins', event.target.checked ? [...form.localPlugins, plugin.name] : form.localPlugins.filter(name => name !== plugin.name))}/>{plugin.name} · 本地工具</label>)}</div>}
        <div className="admin-panel-footer"><button className="button" type="button" disabled={!status?.has10Router} onClick={() => setConfirm('remove')}>移除网关配置</button><button className="button primary" disabled={!payload}><Icon name="check"/>应用客户端配置</button></div>
      </fieldset></form>
    </section>
    {['claude', 'codex'].includes(tool) && <ToolProfiles tool={tool} form={form} payload={payload} onLoad={loadProfile}/>}
    {confirm && <Modal title={confirm === 'remove' ? '移除客户端网关配置' : '应用客户端配置'} busy={busy} onClose={() => setConfirm('')}><p className="delete-message">{confirm === 'remove' ? `从服务器的 ${title} 配置中移除网关接入设置。` : `将 ${title} 的主模型设置为 ${form.model}，接入 ${form.baseUrl}。`}</p>{error && <ErrorBlock message={error}/>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={() => setConfirm('')}>取消</button><button className="button primary" disabled={busy} onClick={apply}>{busy ? '正在写入…' : '确认应用'}</button></div></Modal>}
  </>;
}

export function CLIToolsPage() {
  const statuses = useResource('/api/cli-tools/all-statuses');
  const [params, setParams] = useSearchParams();
  const tool = params.get('tool');
  const catalog = useGatewayModels();
  return <>
    <PageHeading title="CLI 工具" subtitle="管理网关服务器上的客户端接入"><button className="button" disabled={statuses.loading} onClick={statuses.refresh}><Icon name="refresh"/>刷新状态</button></PageHeading>
    {statuses.error && <ErrorBlock message={statuses.error} onRetry={statuses.refresh}/>}{catalog.error && <ErrorBlock message={catalog.error}/>}
    {tool && cliTools.some(([id]) => id === tool) ? <><button className="text-button provider-back" onClick={() => setParams({})}><Icon name="back"/>全部工具</button><div className="admin-settings-content"><ToolSettings key={tool} tool={tool} models={catalog.models} onRefresh={statuses.refresh}/></div></> : <div className="oauth-provider-grid">{cliTools.map(([id, name, description]) => {
      const status = statuses.data?.[id];
      return <article className="oauth-provider-card" key={id} aria-label={`客户端 ${name}`}><div className="admin-card-heading"><ProviderIcon provider={id}/><div><h2>{name}</h2><span className={`status ${status?.has10Router ? 'healthy' : status?.installed ? 'unknown' : 'disabled'}`}><span className="dot"/>{status ? status.installed ? status.has10Router ? '已接入网关' : '已检测' : '未检测到安装' : statuses.loading ? '正在读取' : '打开查看'}</span></div></div><p className="admin-hint">{description}</p><button className="button" onClick={() => setParams({ tool: id })}><Icon name="edit"/>配置 {name}</button></article>;
    })}</div>}
  </>;
}
