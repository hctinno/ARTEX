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

export class ThreadStore {
  private data: StoreData;
  private readonly now: () => Date;
  private readonly newId: () => string;

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
    const resolved = path.resolve(dirPath);
    let isDir = false;
    try {
      isDir = fs.statSync(resolved).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) throw new StoreError('PROJECT_PATH_INVALID', `폴더가 아님: ${resolved}`);
    const existing = this.data.projects.find((p) => p.path === resolved);
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
    const next = { ...this.data.threads[index]!, ...patch, updatedAt: this.now().toISOString() };
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
    } catch {
      return empty();
    }
    try {
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.threads)) {
        throw new Error('형식 불일치');
      }
      return parsed;
    } catch {
      const backup = `${this.filePath}.corrupt-${this.now().getTime()}`;
      fs.renameSync(this.filePath, backup);
      return empty();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }
}
