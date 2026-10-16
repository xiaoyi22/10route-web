import {describe,it,expect,vi} from 'vitest';
import {createSSEStream} from 'open-sse/utils/stream.js';
import {FORMATS} from 'open-sse/translator/formats.js';
vi.mock('@/lib/usageDb.js',()=>({appendRequestLog:vi.fn(async()=>{}),trackPendingRequest:vi.fn(),saveRequestDetail:vi.fn(async()=>{}),saveRequestUsage:vi.fn(async()=>{})}));
describe('independent SSE wire content preservation',()=>{
 for(const newline of ['\n','\r\n','\r']) for(const multiline of [false,true]) for(const sourceFormat of [FORMATS.OPENAI,FORMATS.CLAUDE]) {
  it(JSON.stringify({newline,multiline,sourceFormat}),async()=>{
   const payload=multiline ? ['data: {"id":"chatcmpl-audit","choices":[','data: {"index":0,"delta":{"content":"????"},"finish_reason":null}]}'] : ['data: {"id":"chatcmpl-audit","choices":[{"index":0,"delta":{"content":"????"},"finish_reason":null}]}'];
   const wire=[...payload,'','data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}','','data: [DONE]',''].join(newline);
   const bytes=new TextEncoder().encode(wire);
   const upstream=new ReadableStream({start(c){for(let i=0;i<bytes.length;i++)c.enqueue(bytes.slice(i,i+1));c.close();}});
   const out=await new Response(upstream.pipeThrough(createSSEStream({mode:sourceFormat===FORMATS.OPENAI?'passthrough':'translate',sourceFormat,targetFormat:FORMATS.OPENAI}))).text();
   expect(out).toContain('????');
  });
 }
});
