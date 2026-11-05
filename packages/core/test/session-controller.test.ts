import { describe, expect, it, vi } from 'vitest';
import { SessionController, type AgentPort } from '../src/index';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakePort(overrides: Partial<AgentPort> = {}): AgentPort {
  let n = 0;
  return {
    newSession: vi.fn(async () => ({ sessionId: `s${++n}`, configOptions: [] })),
    loadSession: vi.fn(async () => ({ configOptions: [] })),
    prompt: vi.fn(async () => ({ stopReason: 'end_turn' })),
    cancel: vi.fn(async () => {}),
    setConfigOption: vi.fn(async () => ({ configOptions: [] })),
    ...overrides,
  };
}

const chunk = (sessionId: string, text: string) => ({
  sessionId,
  update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
});

const permission = (sessionId: string) => ({
  sessionId,
  toolCall: { toolCallId: 'tc1', title: 'git push', rawInput: { command: 'git push' } },
  options: [
    { optionId: 'a1', name: '허용', kind: 'allow_once' },
    { optionId: 'a2', name: '항상', kind: 'allow_always' },
    { optionId: 'r1', name: '거부', kind: 'reject_once' },
  ],
});

describe('SessionController', () => {
  it('port 없이 start하면 오류', async () => {
    await expect(new SessionController().start('t1', '/p')).rejects.toThrow('엔진 연결 전');
  });

  it('send: 사용자 항목 추가 → running → done', async () => {
    const gate = deferred<{ stopReason: string }>();
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => gate.promise) }));
    await c.start('t1', '/p');
    const sending = c.send('t1', '고쳐줘');
    expect(c.getThread('t1').status).toBe('running');
    expect(c.getThread('t1').items[0]).toMatchObject({ kind: 'user', text: '고쳐줘' });
    gate.resolve({ stopReason: 'end_turn' });
    await sending;
    expect(c.getThread('t1').status).toBe('done');
  });

  it('두 스레드의 스트림은 sessionId로 분리된다', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    const s1 = await c.start('t1', '/a');
    const s2 = await c.start('t2', '/b');
    c.handleUpdate(chunk(s1, 'A'));
    c.handleUpdate(chunk(s2, 'B'));
    c.handleUpdate(chunk(s1, 'A2'));
    expect(c.getThread('t1').items).toEqual([{ kind: 'agent', id: 'agent-0', text: 'AA2' }]);
    expect(c.getThread('t2').items).toEqual([{ kind: 'agent', id: 'agent-0', text: 'B' }]);
  });

  it('모르는 sessionId·모르는 업데이트는 무시', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    await c.start('t1', '/a');
    c.handleUpdate(chunk('nope', 'x'));
    c.handleUpdate({ sessionId: 's1', update: { sessionUpdate: 'usage_update' } });
    expect(c.getThread('t1').items).toEqual([]);
  });

  it('승인 요청 → awaiting_approval → 승인 응답 → running', async () => {
    const gate = deferred<{ stopReason: string }>();
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => gate.promise) }));
    const sid = await c.start('t1', '/p');
    void c.send('t1', 'push');
    const answer = c.handlePermission(permission(sid));
    const card = c.getThread('t1').items.find((i) => i.kind === 'permission');
    expect(card).toMatchObject({
      title: 'git push',
      available: ['allow_once', 'allow_always', 'reject'],
      resolved: null,
    });
    expect(c.getThread('t1').status).toBe('awaiting_approval');
    c.respond('t1', card!.kind === 'permission' ? card!.requestId : '', 'allow_always');
    await expect(answer).resolves.toEqual({ outcome: { outcome: 'selected', optionId: 'a2' } });
    expect(c.getThread('t1').status).toBe('running');
    gate.resolve({ stopReason: 'end_turn' });
  });

  it('승인 대기 중 중단하면 cancelled로 응답하고 idle', async () => {
    const gate = deferred<{ stopReason: string }>();
    const port = fakePort({ prompt: vi.fn(() => gate.promise) });
    const c = new SessionController();
    c.setPort(port);
    const sid = await c.start('t1', '/p');
    const sending = c.send('t1', 'push');
    const answer = c.handlePermission(permission(sid));
    await c.cancel('t1');
    await expect(answer).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(port.cancel).toHaveBeenCalledWith(sid);
    gate.resolve({ stopReason: 'cancelled' });
    await sending;
    expect(c.getThread('t1').status).toBe('idle');
    expect(c.getThread('t1').items.find((i) => i.kind === 'permission')).toMatchObject({ resolved: 'cancelled' });
  });

  it('prompt 실패 → error 상태 + 오류 항목', async () => {
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(async (): Promise<{ stopReason: string }> => { throw new Error('401 Unauthorized'); }) }));
    await c.start('t1', '/p');
    await c.send('t1', 'x');
    expect(c.getThread('t1').status).toBe('error');
    expect(c.getThread('t1').items.at(-1)).toMatchObject({ kind: 'error', message: '401 Unauthorized' });
  });

  it('엔진 유실 시 진행 중 스레드는 error, 대기 승인은 cancelled', async () => {
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => new Promise<{ stopReason: string }>(() => {})) }));
    const sid = await c.start('t1', '/p');
    await c.start('t2', '/q');
    void c.send('t1', 'x');
    const answer = c.handlePermission(permission(sid));
    c.markEngineLost('엔진 연결 끊김');
    await expect(answer).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(c.getThread('t1').status).toBe('error');
    expect(c.getThread('t2').status).toBe('idle');
  });

  it('start 시 configOptions를 정규화해 보관하고 setConfig로 갱신', async () => {
    const opts = [{ type: 'select', id: 'mode', name: 'Mode', currentValue: 'auto', options: [{ value: 'auto', name: 'auto' }] }];
    const next = [{ ...opts[0], currentValue: 'approve' }];
    const port = fakePort({
      newSession: vi.fn(async () => ({ sessionId: 's9', configOptions: opts })),
      setConfigOption: vi.fn(async () => ({ configOptions: next })),
    });
    const c = new SessionController();
    c.setPort(port);
    await c.start('t1', '/p');
    expect(c.getThread('t1').configOptions[0]!.currentValue).toBe('auto');
    await c.setConfig('t1', 'mode', 'approve');
    expect(port.setConfigOption).toHaveBeenCalledWith('s9', 'mode', 'approve');
    expect(c.getThread('t1').configOptions[0]!.currentValue).toBe('approve');
  });

  it('변경 시 구독자에게 알리고 해제 후에는 알리지 않는다', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    const listener = vi.fn();
    const off = c.subscribe(listener);
    await c.start('t1', '/p');
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    c.handleUpdate(chunk('s1', 'x'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('getThread는 변경이 없으면 같은 객체를 반환한다', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    await c.start('t1', '/p');
    expect(c.getThread('t1')).toBe(c.getThread('t1'));
  });

  it('다른 스레드 변경에도 version이 증가한다 (사이드바 상태 갱신용)', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    const s2 = await c.start('t2', '/q');
    const before = c.getVersion();
    c.handleUpdate(chunk(s2, 'x'));
    expect(c.getVersion()).toBeGreaterThan(before);
  });

  it('엔진 유실 후 prompt가 실패해도 오류 항목은 하나만 남는다', async () => {
    const gate = deferred<{ stopReason: string }>();
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => gate.promise) }));
    await c.start('t1', '/p');
    const sending = c.send('t1', 'x');
    c.markEngineLost('엔진 연결 끊김');
    gate.reject(new Error('socket closed'));
    await sending;
    expect(c.getThread('t1').items.filter((i) => i.kind === 'error')).toHaveLength(1);
    expect(c.getThread('t1').status).toBe('error');
  });

  it('취소 진행 중 도착한 승인 요청은 cancelled로 즉시 응답하고, 다음 send는 정상 동작한다', async () => {
    const gate = deferred<{ stopReason: string }>();
    const gate2 = deferred<{ stopReason: string }>();
    let calls = 0;
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => (++calls === 1 ? gate.promise : gate2.promise)) }));
    const sid = await c.start('t1', '/p');
    const sending = c.send('t1', 'push');
    await c.cancel('t1');
    await expect(c.handlePermission(permission(sid))).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(c.getThread('t1').items.find((i) => i.kind === 'permission')).toBeUndefined();
    gate.resolve({ stopReason: 'cancelled' });
    await sending;
    expect(c.getThread('t1').status).toBe('idle');

    const sending2 = c.send('t1', 'again');
    const answer2 = c.handlePermission(permission(sid));
    expect(c.getThread('t1').items.find((i) => i.kind === 'permission')).toMatchObject({ resolved: null });
    expect(c.getThread('t1').status).toBe('awaiting_approval');
    c.respond('t1', (c.getThread('t1').items.find((i) => i.kind === 'permission') as { requestId: string }).requestId, 'allow_once');
    await expect(answer2).resolves.toEqual({ outcome: { outcome: 'selected', optionId: 'a1' } });
    gate2.resolve({ stopReason: 'end_turn' });
    await sending2;
    expect(c.getThread('t1').status).toBe('done');
  });

  it('idle 스레드에 도착한 승인 요청은 cancelled로 즉시 응답하고 카드를 만들지 않는다', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    const sid = await c.start('t1', '/p');
    await expect(c.handlePermission(permission(sid))).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(c.getThread('t1').items).toEqual([]);
  });

  it('엔진 유실 후 도착한 승인 요청은 cancelled로 즉시 응답하고 카드를 만들지 않는다', async () => {
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => new Promise<{ stopReason: string }>(() => {})) }));
    const sid = await c.start('t1', '/p');
    void c.send('t1', 'x');
    c.markEngineLost('엔진 연결 끊김');
    await expect(c.handlePermission(permission(sid))).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(c.getThread('t1').items.find((i) => i.kind === 'permission')).toBeUndefined();
  });
  it('resume: loadSession이 재생하는 기록은 기존 항목 위에 덧붙지 않고 한 번만 남는다', async () => {
    let c!: SessionController;
    const replay = (sid: string) => {
      c.handleUpdate({ sessionId: sid, update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: '고쳐줘' } } });
      c.handleUpdate(chunk(sid, '고쳤음'));
    };
    c = new SessionController();
    c.setPort(
      fakePort({
        loadSession: vi.fn(async (sid: string) => {
          replay(sid);
          return { configOptions: [] };
        }),
      })
    );
    await c.resume('t1', 'sX', '/p');
    await c.resume('t1', 'sX', '/p');
    expect(c.getThread('t1').items).toEqual([
      { kind: 'user', id: 'user-0', text: '고쳐줘' },
      { kind: 'agent', id: 'agent-1', text: '고쳤음' },
    ]);
  });

  it('resume: 엔진 유실로 error가 된 스레드는 loadSession 성공 후 idle로 복구된다', async () => {
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => new Promise<{ stopReason: string }>(() => {})) }));
    const sid = await c.start('t1', '/p');
    void c.send('t1', 'x');
    c.markEngineLost('엔진 연결 끊김');
    expect(c.getThread('t1').status).toBe('error');
    c.setPort(fakePort());
    await c.resume('t1', sid, '/p');
    expect(c.getThread('t1').status).toBe('idle');
  });

  it('resume: loadSession 실패 시 상태를 idle로 바꾸지 않고 오류를 전파한다', async () => {
    const c = new SessionController();
    c.setPort(fakePort({ loadSession: vi.fn(async (): Promise<{ configOptions: unknown }> => { throw new Error('no session'); }) }));
    await expect(c.resume('t1', 'sX', '/p')).rejects.toThrow('no session');
  });
});
