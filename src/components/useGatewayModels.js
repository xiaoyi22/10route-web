import { useEffect, useState } from 'react';
import { requestJson } from '../api/client.js';
import { modelCatalog } from '../api/data.js';

export function useGatewayModels() {
  const [state, setState] = useState({ models: [], loading: true, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    const paths = ['/api/models', '/api/models/custom', '/api/providers', '/api/provider-nodes', '/api/models/disabled', '/api/combos', '/api/models/distribution'];
    Promise.all(paths.map(path => requestJson(path, { signal: controller.signal }))).then(([builtIn, custom, providers, nodes, disabled, combos, distribution]) => {
      const models = modelCatalog(builtIn.models, custom.models, providers.connections, nodes.nodes, disabled.disabled).filter(model => model.enabled && model.connected);
      const choices = [...models, ...(combos.combos || []).map(combo => ({ id: combo.name, name: combo.name, combo: true }))];
      const published = distribution.mode === 'allowlist' ? new Set(distribution.models || []) : null;
      if (!controller.signal.aborted) setState({ models: choices.filter(model => !published || published.has(model.id)), loading: false, error: '' });
    }).catch(error => { if (!controller.signal.aborted) setState({ models: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, []);
  return state;
}
