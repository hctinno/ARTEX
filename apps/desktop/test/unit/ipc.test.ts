import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INVOKE_CHANNELS } from '../../src/shared/ipc-contract';
import { registerIpcHandlers } from '../../src/main/ipc';
import { ThreadStore } from '../../src/main/thread-store';

function setup(pick: string | null = null) {
  const handlers = new Map<string, (e: unknown, input: unknown) => unknown>();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-ipc-'));
  const store = new ThreadStore(path.join(dir, 'threads.json'));
  registerIpcHandlers(
    { handle: (c, fn) => handlers.set(c, fn) },
    {
      store,
      engine: { getAcpUrl: () => 'ws://127.0.0.1:1/acp?token=x', getStatus: () => ({ state: 'ready' }) },
      pickDirectory: vi.fn(async () => pick),
    }
  );
  const call = (c: string, input?: unknown) => Promise.resolve(handlers.get(c)!(null, input));
  return { handlers, call, dir, store };
}

describe('registerIpcHandlers', () => {
  it('허용 채널 전부를 등록한다', () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort());
  });

  it('projects:pick → 선택한 폴더를 프로젝트로 추가', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-p-'));
    const { call } = setup(folder);
    // 저장소는 realpath로 정규화한다(macOS tmpdir는 /var → /private/var 심볼릭 링크).
    await expect(call('projects:pick')).resolves.toMatchObject({ path: fs.realpathSync.native(folder) });
    await expect(call('projects:list')).resolves.toHaveLength(1);
  });

  it('projects:pick 취소 → null', async () => {
    const { call } = setup(null);
    await expect(call('projects:pick')).resolves.toBeNull();
  });

  it('threads:create 입력 검증 — 빈 제목 거부', async () => {
    const { call } = setup();
    await expect(call('threads:create', { projectId: 'p', title: '' })).rejects.toThrow();
  });

  it('threads:create 입력 검증 — 추가 필드 거부', async () => {
    const { call } = setup();
    await expect(call('threads:create', { projectId: 'p', title: 'a', cwd: '/etc' })).rejects.toThrow();
  });

  it('threads:update는 title·sessionId만 받는다', async () => {
    const { call } = setup();
    await expect(call('threads:update', { id: 'x', worktreePath: '/tmp' })).rejects.toThrow();
  });

  it('engine:getAcpUrl', async () => {
    const { call } = setup();
    await expect(call('engine:getAcpUrl')).resolves.toBe('ws://127.0.0.1:1/acp?token=x');
  });
});
