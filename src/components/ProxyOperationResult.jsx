import { ErrorBlock } from './Controls.jsx';

export default function ProxyOperationResult({ result }) {
  if (!result) return null;
  return <div className="proxy-operation-result" role="status">
    {result.error ? <ErrorBlock message={result.error}/> : result.message && <p className="success-message">{result.message}</p>}
    {typeof result.rolled_back === 'boolean' && <p className={result.rolled_back ? 'muted' : 'error-message'}>{result.rolled_back ? '配置已回滚' : '配置回滚未成功，请检查实际状态'}</p>}
    {result.warning && <p className="status warning">{result.warning}</p>}
    {result.backup && <p className="cell-note">配置备份 <code>{result.backup}</code></p>}
  </div>;
}
