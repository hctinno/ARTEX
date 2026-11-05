import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from '../../src/renderer/state/app-store';

const project = { id: 'p1', name: 'web', path: '/w', addedAt: '2026-11-05T00:00:00.000Z' };
const thread = {
  id: 't1',
  projectId: 'p1',
  kind: 'local',
  title: 'A',
  cwd: '/w',
  branch: null,
  worktreePath: null,
  sessionId: null,
  createdAt: '2026-11-05T00:00:00.000Z',
  updatedAt: '2026-11-05T00:00:00.000Z',
};

let invoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke = vi.fn(async (channel: string) => {
    switch (channel) {
      case 'projects:list':
        return [project];
      case 'threads:list':
        return [thread];
      case 'projects:pick':
        return project;
      case 'threads:create':
        return thread;
      case 'threads:update':
        return { ...thread, sessionId: 's1' };
      default:
        return null;
    }
  });
  (globalThis as any).window.artex = { invoke, onEngineStatus: () => () => {} };
});

describe('AppStore', () => {
  it('refresh는 프로젝트·스레드를 불러온다', async () => {
    const s = new AppStore();
    await s.refresh();
    expect(s.getState()).toMatchObject({ projects: [project], threads: [thread], error: null });
  });

  it('createThread 후 선택 상태로 바뀐다', async () => {
    const s = new AppStore();
    await s.createThread('p1', 'A');
    expect(invoke).toHaveBeenCalledWith('threads:create', { projectId: 'p1', title: 'A' });
    expect(s.getState().selectedThreadId).toBe('t1');
  });

  it('IPC 실패는 error에 담기고 throw하지 않는다', async () => {
    invoke.mockRejectedValueOnce(new Error('PROJECT_PATH_INVALID: 폴더가 아님'));
    const s = new AppStore();
    await s.addProject();
    expect(s.getState().error).toContain('PROJECT_PATH_INVALID');
  });

  it('getState는 변경 전까지 같은 객체', async () => {
    const s = new AppStore();
    expect(s.getState()).toBe(s.getState());
  });
});
