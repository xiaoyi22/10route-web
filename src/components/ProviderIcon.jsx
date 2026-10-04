import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { providerId } from '../api/data.js';

const images = import.meta.glob('../assets/providers/*.png', { query: '?url&no-inline', import: 'default' });
const aliases = { claude: 'anthropic', google: 'gemini', 'gemini-api': 'gemini', 'ollama-local': 'ollama', 'codebuddy-cn': 'workbuddy', 'codebuddy-intl': 'workbuddy' };

export default function ProviderIcon({ provider }) {
  const [failedSource, setFailedSource] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const id = providerId(provider);
  const key = images[`../assets/providers/${id}.png`] ? `../assets/providers/${id}.png` : `../assets/providers/${aliases[id]}.png`;
  useEffect(() => {
    let active = true;
    if (images[key]) images[key]().then(source => { if (active) setLoaded({ key, source }); }).catch(() => { if (active) setLoaded(null); });
    return () => { active = false; };
  }, [key]);
  const source = loaded?.key === key ? loaded.source : null;
  return <span className="provider-mark" title={provider}>
    {source && source !== failedSource ? <img src={source} alt={`${provider} 图标`} onError={() => setFailedSource(source)}/> : <Icon name="server"/>}
  </span>;
}
