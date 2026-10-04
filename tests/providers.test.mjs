import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionProxy, groupProviders, providerInfo, safeProxyUrl } from '../src/api/providers.js';
import { normalizeProviders } from '../src/api/client.js';

test('provider groups resolve aliases and keep separate custom upstream nodes', () => {
  const nodes = [{ id: 'openai-compatible-a', prefix: 'a', name: '供应商甲' }, { id: 'openai-compatible-b', prefix: 'b', name: '供应商乙' }];
  const groups = groupProviders([{ provider: 'codex', isActive: true }, { provider: 'cx', isActive: false }, { provider: nodes[0].id }, { provider: 'b' }], nodes);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].connections.length, 2);
  assert.equal(groups[0].enabled, 1);
  assert.equal(providerInfo('a', nodes).name, '供应商甲');
  assert.equal(providerInfo('openai-compatible-deleted').name, '自定义节点（名称未加载）');
  assert.equal(providerInfo('codebuddy-cn').name, 'WorkBuddy / CodeBuddy CN');
  assert.equal(providerInfo('cc').name, 'Claude Code');
});

test('proxy display follows backend pool, dedicated, global precedence and masks credentials', () => {
  const settings = { outboundProxyEnabled: true, outboundProxyUrl: 'http://127.0.0.1:7891', outboundNoProxy: '.tencent.com' };
  const pools = [{ id: 'pool', name: '优选', isActive: true, proxyUrl: 'http://127.0.0.1:7892', noProxy: '.qoder.com', strictProxy: true }];
  const connection = { proxyPoolId: 'pool', connectionProxyEnabled: true, connectionProxyUrl: 'http://user:secret@localhost:8888/?token=secret' };
  assert.equal(connectionProxy(connection, pools, settings).title, '优选');
  assert.equal(connectionProxy(connection, pools, settings).strict, true);
  assert.equal(connectionProxy(connection, pools, settings).noProxy, '.qoder.com');
  const fallback = connectionProxy(connection, [], settings);
  assert.equal(fallback.source, 'connection');
  assert(fallback.warning);
  assert.equal(fallback.address, 'http://***@localhost:8888');
  assert.equal(connectionProxy({}, [], settings).noProxy, '.tencent.com');
  assert.equal(connectionProxy({}, null, settings).source, 'unknown');
  assert.equal(safeProxyUrl('invalid-secret'), '地址不可识别');
});

test('connection normalization selects proxy metadata without leaking credential fields', () => {
  const [connection] = normalizeProviders({ connections: [{ id: 'a', provider: 'codex', accessToken: 'secret', providerSpecificData: { proxyPoolId: 'pool', connectionProxyUrl: 'http://localhost:8888', refreshToken: 'secret' } }] });
  assert.equal(connection.proxyPoolId, 'pool');
  assert.equal(connection.connectionProxyUrl, 'http://localhost:8888');
  assert(!JSON.stringify(connection).includes('secret'));
  assert.equal(normalizeProviders({ connections: [{ providerSpecificData: { proxyPoolId: '__none__' } }] })[0].proxyPoolId, '');
});
