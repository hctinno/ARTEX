import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProjectRecord, ThreadRecord } from '@artex/core';

type StoreErrorCode = 'PROJECT_PATH_INVALID' | 'PROJECT_NOT_FOUND' | 'THREAD_NOT_FOUND';

export class StoreError extends Error {
  constructor(
    public readonly code: StoreErrorCode,
    message: string
  ) {
    super(`${code}: ${message}`);
  }
}

interface StoreData {
  version: 1;
  projects: ProjectRecord[];
  threads: ThreadRecord[];
}

const empty = (): StoreData => ({ version: 1, projects: [], threads: [] });

function errnoCode(e: unknown): string | undefined {
  return (e as NodeJS.ErrnoException | undefined)?.code;
}

function pathKey(p: string, platform: NodeJS.Platform): string {
  const lib = platform === 'win32' ? path.win32 : path.posix;
  let n = lib.normalize(p);
  const root = lib.parse(n).root;
  while (n.length > root.length && /[\\/]$/.test(n)) n = n.slice(0, -1);
  return platform === 'win32' ? n.toLowerCase() : n;
}

/** 같은 경로인지 비교. win32는 대소문자와 끝 구분자를 무시한다. */
export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  return pathKey(a, platform) === pathKey(b, platform);
}

export class ThreadStore {
  private data: StoreData;
  private readonly now: () => Date;
  private readonly newId: () => string;
  /** 읽기 실패로 원본을 옮기지 못한 경우, 다음 저장 직전에 한 번 보존을 시도할 백업 경로. */
  private pendingBackup: string | null = null;

  constructor(
    private readonly filePath: string,
    deps: { now?: () => Date; newId?: () => string } = {}
  ) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.data = this.load();
  }

  listProjects(): ProjectRecord[] {
    return [...this.data.projects];
  }

  addProject(dirPath: string): ProjectRecord {
    const absolute = path.resolve(dirPath);
    let resolved: string;
    try {
      resolved = fs.realpathSync.native(absolute);
      if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
    } catch {
      throw new StoreError('PROJECT_PATH_INVALID', `폴더가 아님: ${absolute}`);
    }
    const existing = this.data.projects.find((p) => samePath(p.path, resolved));
    if (existing) return existing;
    const project: ProjectRecord = {
      id: this.newId(),
      name: path.basename(resolved),
      path: resolved,
      addedAt: this.now().toISOString(),
    };
    this.data.projects.push(project);
    this.save();
    return project;
  }

  listThreads(projectId?: string): ThreadRecord[] {
    return this.data.threads
      .filter((t) => projectId === undefined || t.projectId === projectId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  createLocalThread(projectId: string, title: string): ThreadRecord {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) throw new StoreError('PROJECT_NOT_FOUND', `프로젝트 없음: ${projectId}`);
    const at = this.now().toISOString();
    const thread: ThreadRecord = {
      id: this.newId(),
      projectId,
      kind: 'local',
      title,
      cwd: project.path,
      branch: null,
      worktreePath: null,
      sessionId: null,
      createdAt: at,
      updatedAt: at,
    };
    this.data.threads.push(thread);
    this.save();
    return thread;
  }

  updateThread(id: string, patch: { title?: string; sessionId?: string }): ThreadRecord {
    const index = this.data.threads.findIndex((t) => t.id === id);
    if (index === -1) throw new StoreError('THREAD_NOT_FOUND', `스레드 없음: ${id}`);
    const next: ThreadRecord = { ...this.data.threads[index]!, updatedAt: this.now().toISOString() };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.sessionId !== undefined) next.sessionId = patch.sessionId;
    this.data.threads[index] = next;
    this.save();
    return next;
  }

  deleteThread(id: string): void {
    const before = this.data.threads.length;
    this.data.threads = this.data.threads.filter((t) => t.id !== id);
    if (this.data.threads.length === before) throw new StoreError('THREAD_NOT_FOUND', `스레드 없음: ${id}`);
    this.save();
  }

  private load(): StoreData {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (e) {
      if (errnoCode(e) === 'ENOENT') return empty();
      this.setAside('unreadable');
      return empty();
    }
    try {
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.threads)) {
        throw new Error('형식 불일치');
      }
      return parsed;
    } catch {
      this.setAside('corrupt');
      return empty();
    }
  }

  /** 읽지 못한 원본을 백업으로 옮긴다 (rename, 실패 시 copy). 둘 다 실패하면 다음 저장 전에 재시도. 절대 던지지 않는다. */
  private setAside(kind: 'corrupt' | 'unreadable'): void {
    const backup = `${this.filePath}.${kind}-${this.now().getTime()}`;
    if (!this.preserveFile(backup)) this.pendingBackup = backup;
  }

  private preserveFile(backup: string): boolean {
    try {
      fs.renameSync(this.filePath, backup);
      return true;
    } catch {
      // rename 실패 시 원본을 남긴 채 copy로 백업한다.
    }
    try {
      fs.copyFileSync(this.filePath, backup);
      return true;
    } catch {
      return false;
    }
  }

  private save(): void {
    if (this.pendingBackup !== null) {
      const backup = this.pendingBackup;
      this.pendingBackup = null; // 저장 시도 1회만 보존한다 (best effort).
      this.preserveFile(backup);
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }
}
