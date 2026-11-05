import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StoreError, ThreadStore } from '../../src/main/thread-store';

let dir: string;
let file: string;
let clock: number;
let ids: number;

function store() {
  return new ThreadStore(file, {
    now: () => new Date(Date.UTC(2026, 10, 5, 0, 0, clock++)),
    newId: () => `id-${++ids}`,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-store-'));
  file = path.join(dir, 'threads.json');
  clock = 0;
  ids = 0;
});

describe('ThreadStore', () => {
  it('프로젝트 추가 후 재시작해도 남는다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const p = store().addProject(project);
    expect(p).toMatchObject({ id: 'id-1', path: project, name: path.basename(project) });
    expect(store().listProjects()).toEqual([p]);
  });

  it('같은 경로는 중복 추가하지 않는다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const a = s.addProject(project);
    expect(s.addProject(project)).toEqual(a);
    expect(s.listProjects()).toHaveLength(1);
  });

  it.each([
    ['없는 경로', () => path.join(dir, 'missing')],
    ['파일 경로', () => {
      const f = path.join(dir, 'a.txt');
      fs.writeFileSync(f, 'x');
      return f;
    }],
  ])('%s는 PROJECT_PATH_INVALID, 파일 불변', (_label, make) => {
    const s = store();
    expect(() => s.addProject(make())).toThrow(StoreError);
    try {
      s.addProject(make());
    } catch (e) {
      expect((e as StoreError).code).toBe('PROJECT_PATH_INVALID');
    }
    expect(fs.existsSync(file)).toBe(false);
  });

  it('Local 스레드는 프로젝트 경로를 cwd로 쓴다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const p = s.addProject(project);
    const t = s.createLocalThread(p.id, '토큰 갱신 수정');
    expect(t).toMatchObject({
      projectId: p.id,
      kind: 'local',
      title: '토큰 갱신 수정',
      cwd: project,
      branch: null,
      worktreePath: null,
      sessionId: null,
    });
  });

  it('없는 프로젝트에 스레드 생성은 PROJECT_NOT_FOUND', () => {
    expect(() => store().createLocalThread('nope', 'x')).toThrow(/PROJECT_NOT_FOUND|프로젝트 없음/);
  });

  it('updateThread는 updatedAt을 갱신하고 목록은 최신순', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const p = s.addProject(project);
    const a = s.createLocalThread(p.id, 'A');
    const b = s.createLocalThread(p.id, 'B');
    s.updateThread(a.id, { sessionId: 'sess-1' });
    expect(s.listThreads(p.id).map((t) => t.title)).toEqual(['A', 'B']);
    expect(store().listThreads()[0]).toMatchObject({ id: a.id, sessionId: 'sess-1' });
    expect(b.updatedAt < s.listThreads()[0]!.updatedAt).toBe(true);
  });

  it('deleteThread 후 목록에서 사라진다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const t = s.createLocalThread(s.addProject(project).id, 'A');
    s.deleteThread(t.id);
    expect(s.listThreads()).toEqual([]);
    expect(() => s.deleteThread(t.id)).toThrow(StoreError);
  });

  it('손상된 파일은 백업 후 빈 상태로 시작', () => {
    fs.writeFileSync(file, '{ broken');
    const s = store();
    expect(s.listProjects()).toEqual([]);
    const backups = fs.readdirSync(dir).filter((n) => n.startsWith('threads.json.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, backups[0]!), 'utf8')).toBe('{ broken');
  });

  it('저장은 임시 파일 교체 방식 (tmp 파일이 남지 않음)', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    store().addProject(project);
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});
