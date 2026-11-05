import http from 'node:http';

export type FakeTurn = { text: string } | { toolCall: { name: string; arguments: Record<string, unknown> } };

function sse(res: http.ServerResponse, chunks: object[]) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.end('data: [DONE]\n\n');
}

export async function startFakeOpenAI(script: FakeTurn[]) {
  const requests: unknown[] = [];
  let turn = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url?.includes('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'fake-model', object: 'model' }] }));
        return;
      }
      const parsed = body ? JSON.parse(body) : {};
      requests.push(parsed);
      // 엔진은 첫 지시와 동시에 도구 없이 세션 제목 생성 호출을 따로 보낸다(goose session_name 프롬프트).
      // 이런 보조 호출은 시나리오 턴을 소비하지 않고 고정 텍스트로 답한다.
      const auxiliary = !Array.isArray(parsed.tools) || parsed.tools.length === 0;
      const step: FakeTurn = auxiliary ? { text: 'E2E 스레드' } : script[Math.min(turn++, script.length - 1)]!;
      const base = { id: `c${turn}`, object: 'chat.completion.chunk', created: 0, model: 'fake-model' };
      const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
      if ('text' in step) {
        const delta = { role: 'assistant', content: step.text };
        if (parsed.stream) {
          sse(res, [
            { ...base, choices: [{ index: 0, delta, finish_reason: null }] },
            { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
          ]);
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: delta, finish_reason: 'stop' }], usage }));
        }
        return;
      }
      const call = { index: 0, id: `call_${turn}`, type: 'function', function: { name: step.toolCall.name, arguments: JSON.stringify(step.toolCall.arguments) } };
      if (parsed.stream) {
        sse(res, [
          { ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] },
          { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
        ]);
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }], usage }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
