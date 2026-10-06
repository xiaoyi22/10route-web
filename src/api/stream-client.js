import { ApiError } from './client.js';
import { isAllowedRequest } from './policy.js';

export async function openApiResponse(url, options) {
  if (!isAllowedRequest(url, options.method || 'POST', typeof __MANAGEMENT_ENABLED__ !== 'undefined' && __MANAGEMENT_ENABLED__)) throw new ApiError('当前访问模式不允许此操作', 405);
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = typeof body.error === 'object' ? body.error.message : body.error;
    throw new ApiError(error || body.message || `请求失败（HTTP ${response.status}）`, response.status);
  }
  return response;
}

export async function consumeChatResponse(response, onChunk) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const body = await response.json();
    if (body.error) throw new Error(body.error.message || String(body.error));
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error('网关未返回聊天响应');
    onChunk({ text: typeof message.content === 'string' ? message.content : (message.content || []).map(part => part.text || '').join(''), reasoning: message.reasoning_content || '', usage: body.usage, tools: message.tool_calls });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let finished = false;
  function event(block) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { finished = true; return; }
    const parsed = JSON.parse(data);
    if (parsed.error) throw new Error(parsed.error.message || String(parsed.error));
    const choice = parsed.choices?.[0];
    if (choice?.finish_reason) finished = true;
    const delta = choice?.delta || {};
    onChunk({ text: typeof delta.content === 'string' ? delta.content : '', reasoning: delta.reasoning_content || delta.reasoning || '', usage: parsed.usage, tools: delta.tool_calls });
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop();
      for (const block of blocks) event(block);
      if (done) break;
    }
    if (buffer.trim()) event(buffer);
    if (!finished) throw new Error('响应流提前结束，已保留收到的内容');
  } finally { reader.releaseLock(); }
}
