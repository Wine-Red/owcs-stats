const test = require('node:test');
const assert = require('node:assert/strict');
const ChatModelClient = require('../services/agent/ChatModelClient');

test('uses GLM-4.7-Flash with the Zhipu function-call request shape', async () => {
  let requestBody;
  const client = new ChatModelClient({
    provider: 'zhipu',
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    model: 'glm-4.7-flash',
    fetch: async (url, options) => {
      assert.equal(url, 'https://example.test/chat/completions');
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { tool_calls: [{ function: { name: 'answer', arguments: '{"ok":true}' } }] } }],
          usage: { total_tokens: 12 }
        })
      };
    }
  });
  const tool = { type: 'function', function: { name: 'answer', strict: true, parameters: { type: 'object' } } };
  const result = await client.callTool({ messages: [{ role: 'user', content: 'test' }], tool });
  assert.deepEqual(result.value, { ok: true });
  assert.equal(requestBody.model, 'glm-4.7-flash');
  assert.deepEqual(requestBody.thinking, { type: 'disabled' });
  assert.deepEqual(requestBody.tool_choice, { type: 'function', function: { name: 'answer' } });
  assert.equal(requestBody.do_sample, false);
  assert.equal('strict' in requestBody.tools[0].function, false);
});

test('uses Qwen3.5-4B with the SiliconFlow request shape', async () => {
  let requestBody;
  const client = new ChatModelClient({
    provider: 'siliconflow',
    apiKey: 'test-key',
    baseUrl: 'https://api.siliconflow.test/v1',
    model: 'Qwen/Qwen3.5-4B',
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.siliconflow.test/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { tool_calls: [{ function: { name: 'answer', arguments: '{"ok":true}' } }] } }]
        })
      };
    }
  });
  const tool = { type: 'function', function: { name: 'answer', strict: true, parameters: { type: 'object' } } };
  await client.callTool({ messages: [{ role: 'user', content: 'test' }], tool });

  assert.equal(requestBody.model, 'Qwen/Qwen3.5-4B');
  assert.equal(requestBody.enable_thinking, false);
  assert.equal(requestBody.thinking, undefined);
  assert.equal(requestBody.tools[0].function.strict, false);
  assert.deepEqual(requestBody.tool_choice, { type: 'function', function: { name: 'answer' } });
});
