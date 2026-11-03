import test from 'node:test';
import assert from 'node:assert/strict';
import { agent, connect } from './agent.js';

const gateway = { url: 'https://gateway.example.invalid', v1: 'https://gateway.example.invalid/v1', key: 'test-key' };
const selected = (entries, g = gateway) => connect({ gateway: g, models: entries })['providers.magpie.models'];

test('Go configuration and resource locations', () => {
  assert.equal(agent.id, 'firstrule-go');
  assert.equal(agent.bin, 'firstrule');
  assert.equal(agent.config, '~/.firstrule-go/agent/models.json');
  assert.equal(agent.library.mcp, '~/.firstrule-go/agent/mcp.json');
  assert.equal(agent.library.mcpFormat, 'claude');
  assert.equal(agent.library.skills, '~/.firstrule-go/agent/skills');
  assert.equal(agent.model, undefined);
});

test('native endpoints, priority, gateway fallback and credentials', () => {
  const endpoints = ['/v1/chat/completions', '/v1/messages', '/v1/responses'];
  assert.equal(selected([{ id: 'example/model', native_endpoints: endpoints }])[0].api, 'openai-responses');
  for (const [endpoint, api, baseUrl] of [
    ['/v1/responses', 'openai-responses', gateway.v1],
    ['/v1/messages', 'anthropic-messages', gateway.url],
    ['/v1/chat/completions', 'openai-completions', gateway.v1],
  ]) {
    const [model] = selected([{ id: 'example/model', native_endpoints: [endpoint] }]);
    assert.equal(model.api, api);
    assert.equal(model.baseUrl, baseUrl);
    assert.equal(model.id, 'example/model');
  }
  assert.equal(selected([{ id: 'example/model', native_endpoints: endpoints }], { ...gateway, v1: undefined, url: gateway.url + '///' })[0].baseUrl, gateway.v1);
  const result = connect({ gateway, model: { id: 'example/legacy' } });
  assert.equal(result['providers.magpie.api'], 'anthropic-messages');
  assert.equal(result['providers.magpie.apiKey'], 'test-key');
  assert.equal(result['providers.magpie.models'][0].api, undefined);
});

test('model metadata, price conversion and supported thinking levels', () => {
  const [model] = selected([{ id: 'example/reasoner', context: 120000, output: 8192, images: true,
    efforts: ['none', 'high'], pricing: { prompt: '0.0000004', completion: '2e-6', input_cache_read: '0' } }]);
  assert.deepEqual(model.cost, { input: 0.4, output: 2, cacheRead: 0, cacheWrite: 0 });
  assert.deepEqual(model.input, ['text', 'image']);
  assert.equal(model.contextWindow, 120000);
  assert.equal(model.maxTokens, 8192);
  assert.equal(model.reasoning, true);
  assert.equal(model.thinkingLevelMap.off, 'none');
  assert.equal(model.thinkingLevelMap.high, 'high');
  assert.equal(model.thinkingLevelMap.low, null);
  assert.equal(selected([{ id: 'example/free', pricing: { prompt: 0, completion: 0 } }])[0].cost.input, 0);
  assert.equal(selected([{ id: 'example/bad', pricing: { prompt: -1, completion: 0 } }])[0].cost, undefined);
});

test('whole model list, empty selection and legacy input', () => {
  assert.deepEqual(selected([null, { id: '' }, { id: 'example/a' }, { id: 'example/b' }]).map(m => m.id), ['example/a', 'example/b']);
  assert.deepEqual(selected([]), []);
  assert.equal(connect({ gateway, model: [{ id: 'example/legacy' }] })['providers.magpie.models'].length, 1);
});
