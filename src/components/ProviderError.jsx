import { providerFailure } from '../api/providers.js';

export default function ProviderError({ error, authType, name }) {
  const failure = providerFailure(error, authType);
  return <div className="provider-error" role="alert">
    {name && <span className="provider-error-name">{name}</span>}
    <strong>{failure.label}</strong>
    <p>{failure.hint}</p>
    <details><summary>原始错误</summary><pre>{failure.raw || '上游未提供具体错误'}</pre></details>
  </div>;
}
