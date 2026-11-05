import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { samePath, StoreError, ThreadStore } from '../../src/main/thread-store';

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

function errno(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('ThreadStore fix round 1', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('손상 파일 백업 rename이 EBUSY로 실패해도 생성자는 던지지 않고 copy로 백업한다', () => {
    fs.writeFileSync(file, '{ broken');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw errno('EBUSY');
    });
    let s!: ThreadStore;
    expect(() => {
      s = store();
    }).not.toThrow();
    expect(s.listProjects()).toEqual([]);
    const backups = fs.readdirSync(dir).filter((n) => n.startsWith('threads.json.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, backups[0]!), 'utf8')).toBe('{ broken');
  });

  it('읽기 불가(EISDIR) 파일은 던지지 않고, 원본을 unreadable 백업으로 보존한다', () => {
    fs.mkdirSync(file);
    let s!: ThreadStore;
    expect(() => {
      s = store();
    }).not.toThrow();
    expect(s.listProjects()).toEqual([]);
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    s.addProject(project);
    const kept = fs.readdirSync(dir).filter((n) => n.startsWith('threads.json.unreadable-'));
    expect(kept).toHaveLength(1);
    expect(fs.statSync(path.join(dir, kept[0]!)).isDirectory()).toBe(true);
    expect(fs.statSync(file).isFile()).toBe(true);
    expect(store().listProjects()).toHaveLength(1);
  });

  it('EACCES 읽기 실패 + 백업 불가여도 던지지 않고, 첫 저장 전에 원본 내용을 보존한다', () => {
    fs.writeFileSync(file, 'real-data');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw errno('EACCES');
    });
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw errno('EBUSY');
    });
    vi.spyOn(fs, 'copyFileSync').mockImplementationOnce(() => {
      throw errno('EACCES');
    });
    let s!: ThreadStore;
    expect(() => {
      s = store();
    }).not.toThrow();
    expect(s.listProjects()).toEqual([]);
    s.addProject(fs.mkdtempSync(path.join(dir, 'proj-')));
    const kept = fs.readdirSync(dir).filter((n) => n.startsWith('threads.json.unreadable-'));
    expect(kept).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, kept[0]!), 'utf8')).toBe('real-data');
    expect(store().listProjects()).toHaveLength(1);
  });

  it('ENOENT만 빈 상태 시작이다 (백업 파일을 만들지 않는다)', () => {
    expect(store().listProjects()).toEqual([]);
    expect(fs.readdirSync(dir).filter((n) => n.startsWith('threads.json.'))).toEqual([]);
  });

  it('samePath: win32는 대소문자와 끝 구분자를 무시, 그 외 플랫폼은 구분', () => {
    expect(samePath('C:\\Foo', 'c:\\foo', 'win32')).toBe(true);
    expect(samePath('C:\\Foo\\', 'C:\\Foo', 'win32')).toBe(true);
    expect(samePath('C:\\Foo', 'c:\\foo', 'linux')).toBe(false);
    expect(samePath('/a/Foo', '/a/foo', 'linux')).toBe(false);
  });

  it('realpath, ./ 포함, 끝 구분자 변형은 같은 프로젝트로 중복 제거된다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const real = fs.realpathSync.native(project);
    const s = store();
    const a = s.addProject(real);
    const b = s.addProject(`${path.join(project, '.')}${path.sep}`);
    const c = s.addProject(project);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(a.path).toBe(real);
    expect(s.listProjects()).toHaveLength(1);
  });

  it('updateThread는 undefined sessionId를 무시한다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const t = s.createLocalThread(s.addProject(project).id, 'A');
    s.updateThread(t.id, { sessionId: 'sess-1' });
    const next = s.updateThread(t.id, { sessionId: undefined } as any);
    expect(next.sessionId).toBe('sess-1');
    expect(store().listThreads()[0]!.sessionId).toBe('sess-1');
  });

  it('updateThread는 허용되지 않은 키(cwd 등)를 바꾸지 않는다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const t = s.createLocalThread(s.addProject(project).id, 'A');
    const next = s.updateThread(t.id, { cwd: '/etc' } as any);
    expect(next.cwd).toBe(project);
    expect(store().listThreads()[0]!.cwd).toBe(project);
  });
});
