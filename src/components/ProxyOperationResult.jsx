import { ErrorBlock } from './Controls.jsx';

export default function ProxyOperationResult({ result }) {
  if (!result) return null;
  const stage = { policy: '出口筛选', install: '配置安装', reload: '配置重载' }[result.stage];
  return <div className="proxy-operation-result" role="status">
    {result.error ? <ErrorBlock message={result.error}/> : result.message && <p className="success-message">{result.message}</p>}
    {stage && <p className="muted">失败阶段：{stage}</p>}
    {result.state === 'unknown' && <p className="error-message">配置安装结果未确认，请检查实际状态后再操作</p>}
    {typeof result.rolled_back === 'boolean' && <p className={result.rolled_back ? 'muted' : 'error-message'}>{result.rolled_back ? '配置已回滚' : '配置回滚未成功，请检查实际状态'}</p>}
    {result.warning && <p className="status warning">{result.warning}</p>}
    {result.backup && <p className="cell-note">配置备份 <code>{result.backup}</code></p>}
  </div>;
}
