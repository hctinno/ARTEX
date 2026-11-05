import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { EngineManager, type EngineStatus } from '../../src/main/engine';

const fake = path.join(__dirname, '../fixtures/fake-engine.mjs');
const managers: EngineManager[] = [];

function create(mode: string, logs: string[] = []) {
  const m = new EngineManager({
    binaryPath: process.execPath,
    argsPrefix: [fake],
    cwd: process.cwd(),
    env: { FAKE_ENGINE_MODE: mode },
    backoffBaseMs: 20,
    readinessTimeoutMs: 3000,
    log: (line) => logs.push(line),
  });
  managers.push(m);
  return m;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.stop()));
});

describe('EngineManager', () => {
  it('준비되면 ready 상태와 토큰 포함 acpUrl', async () => {
    const m = create('ok');
    const url = await m.start();
    expect(url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/acp\?token=/);
    expect(m.getStatus().state).toBe('ready');
    expect(m.getAcpUrl()).toBe(url);
  });

  it('로그에 비밀키 원문이 남지 않는다', async () => {
    const logs: string[] = [];
    const m = create('ok', logs);
    const url = await m.start();
    const secret = decodeURIComponent(new URL(url).searchParams.get('token')!);
    await new Promise((r) => setTimeout(r, 100));
    expect(logs.join('\n')).toContain('secret=REDACTED');
    expect(logs.join('\n')).not.toContain(secret);
  });

  it('실행 직후 종료가 반복되면 3회 재시작 후 failed', async () => {
    const m = create('crash-immediately');
    const states: EngineStatus['state'][] = [];
    m.on('status', (s: EngineStatus) => states.push(s.state));
    await expect(m.start()).rejects.toThrow('엔진 시작 실패');
    expect(states.filter((s) => s === 'restarting')).toHaveLength(3);
    expect(m.getStatus().state).toBe('failed');
  });

  it('준비 후 비정상 종료되면 재시작해 다시 ready', async () => {
    const m = create('crash-after-ready');
    await m.start();
    const restarted = new Promise<void>((resolve) => {
      m.on('status', (s: EngineStatus) => s.state === 'restarting' && resolve());
    });
    await restarted;
    expect(['restarting', 'starting', 'ready']).toContain(m.getStatus().state);
  });

  it('stop 후에는 재시작하지 않는다', async () => {
    const m = create('ok');
    await m.start();
    await m.stop();
    await new Promise((r) => setTimeout(r, 200));
    expect(m.getStatus().state).toBe('stopped');
    expect(m.getAcpUrl()).toBeNull();
  });
});
