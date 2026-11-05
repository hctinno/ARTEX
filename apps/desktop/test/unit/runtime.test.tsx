import { afterEach, describe, expect, it, vi } from 'vitest';
import { dedupe, Reconnector, reconnectDelay } from '../../src/renderer/runtime';

describe('dedupe', () => {
  it('동시 호출은 fn을 한 번만 실행하고 같은 promise를 반환', async () => {
    const map = new Map<string, Promise<void>>();
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => (release = r)));
    const a = dedupe(map, 't1', fn);
    const b = dedupe(map, 't1', fn);
    expect(a).toBe(b);
    release();
    await a;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(0);
  });

  it('실패 후에는 정리되어 다시 실행 가능', async () => {
    const map = new Map<string, Promise<void>>();
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    await expect(dedupe(map, 't1', fn)).rejects.toThrow('x');
    await dedupe(map, 't1', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('reconnectDelay', () => {
  it('0.5s부터 두 배씩, 10s에서 멈춘다', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(reconnectDelay)).toEqual([500, 1000, 2000, 4000, 8000, 10_000, 10_000, 10_000]);
  });
});

describe('Reconnector', () => {
  const setup = (results: (() => Promise<void>)[]) => {
    vi.useFakeTimers();
    const boot = vi.fn(() => (results.shift() ?? (() => Promise.resolve()))());
    return { boot, r: new Reconnector(boot) };
  };
  const fail = () => Promise.reject(new Error('down'));
  const ok = () => Promise.resolve();
  afterEach(() => vi.useRealTimers());

  it('ready가 되면 즉시 연결, 실패하면 0.5s·1s·2s 간격으로 재시도하고 성공 시 횟수를 초기화', async () => {
    const { boot, r } = setup([fail, fail, fail, ok, fail, ok]);
    r.setReady(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(boot).toHaveBeenCalledTimes(1);
    expect(r.getState()).toMatchObject({ error: 'down', attempt: 1 });
    await vi.advanceTimersByTimeAsync(499);
    expect(boot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(boot).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(boot).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(boot).toHaveBeenCalledTimes(4);
    expect(r.getState()).toMatchObject({ error: null, attempt: 0 });
    r.onLost('엔진 연결 끊김');
    expect(r.getState().error).toBe('엔진 연결 끊김');
    await vi.advanceTimersByTimeAsync(500);
    expect(boot).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(boot).toHaveBeenCalledTimes(6);
    expect(r.getState().error).toBeNull();
  });

  it('엔진이 ready가 아니면 끊겨도 재시도하지 않고, 대기 중인 재시도도 취소', async () => {
    const { boot, r } = setup([fail]);
    r.setReady(true);
    await vi.advanceTimersByTimeAsync(0);
    r.setReady(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(boot).toHaveBeenCalledTimes(1);
    r.onLost('x');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(boot).toHaveBeenCalledTimes(1);
  });

  it('connectNow는 대기 중인 재시도를 앞당긴다', async () => {
    const { boot, r } = setup([fail, ok]);
    r.setReady(true);
    await vi.advanceTimersByTimeAsync(0);
    void r.connectNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(boot).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(boot).toHaveBeenCalledTimes(2);
  });

  it('지연 상한은 10s', async () => {
    const { boot, r } = setup(Array.from({ length: 20 }, () => fail));
    r.setReady(true);
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 4000 + 8000);
    expect(boot).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(boot).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(boot).toHaveBeenCalledTimes(7);
  });
});

describe('ensureThreadSession: 연결 세대별 dedupe', () => {
  type Deferred = { promise: Promise<{ configOptions: unknown }>; resolve: () => void };
  const deferred = (): Deferred => {
    let resolve!: () => void;
    const promise = new Promise<{ configOptions: unknown }>((r) => (resolve = () => r({ configOptions: [] })));
    return { promise, resolve };
  };
  const thread = { id: 't1', projectId: 'p1', kind: 'local', title: 't', cwd: '/p', branch: null, worktreePath: null, sessionId: 's1' } as never;

  async function load() {
    vi.resetModules();
    const conns: { loadSession: ReturnType<typeof vi.fn>; gate: Deferred }[] = [];
    vi.doMock('../../src/renderer/acp/connection', () => ({
      connectEngine: vi.fn(async () => {
        const gate = deferred();
        const conn = {
          gate,
          loadSession: vi.fn(() => gate.promise),
          newSession: vi.fn(),
          prompt: vi.fn(),
          cancel: vi.fn(),
          setConfigOption: vi.fn(),
          close: vi.fn(),
        };
        conns.push(conn);
        return conn;
      }),
    }));
    (globalThis as unknown as { window: { artex: unknown } }).window.artex = {
      invoke: vi.fn(async () => 'ws://127.0.0.1:1/acp'),
    };
    const rt = await import('../../src/renderer/runtime');
    return { rt, conns };
  }
  afterEach(() => vi.doUnmock('../../src/renderer/acp/connection'));

  it('이전 연결에서 진행 중인 attach를 새 연결이 재사용하지 않는다', async () => {
    const { rt, conns } = await load();
    await rt.bootEngine();
    const first = rt.ensureThreadSession(thread);
    await rt.bootEngine();
    const second = rt.ensureThreadSession(thread);
    expect(second).not.toBe(first);
    expect(conns[1]!.loadSession).toHaveBeenCalledTimes(1);
    conns[0]!.gate.resolve();
    conns[1]!.gate.resolve();
    await Promise.all([first, second]);
  });

  it('이전 연결의 attach가 늦게 끝나도 새 연결에서 attached로 표시되지 않는다', async () => {
    const { rt, conns } = await load();
    await rt.bootEngine();
    const first = rt.ensureThreadSession(thread);
    await rt.bootEngine();
    conns[0]!.gate.resolve();
    await first;
    const again = rt.ensureThreadSession(thread);
    expect(conns[1]!.loadSession).toHaveBeenCalledTimes(1);
    conns[1]!.gate.resolve();
    await again;
    await rt.ensureThreadSession(thread);
    expect(conns[1]!.loadSession).toHaveBeenCalledTimes(1);
  });
});
