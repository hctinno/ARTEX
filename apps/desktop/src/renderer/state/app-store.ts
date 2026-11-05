import type { ProjectRecord, ThreadRecord } from '@artex/core';

export interface AppState {
  projects: ProjectRecord[];
  threads: ThreadRecord[];
  selectedThreadId: string | null;
  error: string | null;
}

export class AppStore {
  private state: AppState = { projects: [], threads: [], selectedThreadId: null, error: null };
  private listeners = new Set<() => void>();

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    await this.guard(async () => {
      const [projects, threads] = await Promise.all([
        window.artex.invoke('projects:list') as Promise<ProjectRecord[]>,
        window.artex.invoke('threads:list') as Promise<ThreadRecord[]>,
      ]);
      this.set({ projects, threads });
    });
  }

  async addProject(): Promise<void> {
    await this.guard(async () => {
      const added = (await window.artex.invoke('projects:pick')) as ProjectRecord | null;
      if (added) await this.refresh();
    });
  }

  selectThread(id: string | null): void {
    this.set({ selectedThreadId: id });
  }

  async createThread(projectId: string, title: string): Promise<ThreadRecord> {
    const thread = (await window.artex.invoke('threads:create', { projectId, title })) as ThreadRecord;
    await this.refresh();
    this.set({ selectedThreadId: thread.id });
    return thread;
  }

  async setSessionId(threadId: string, sessionId: string): Promise<void> {
    await this.guard(async () => {
      await window.artex.invoke('threads:update', { id: threadId, sessionId });
      await this.refresh();
    });
  }

  clearError(): void {
    this.set({ error: null });
  }

  private async guard(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.set({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private set(change: Partial<AppState>): void {
    this.state = { ...this.state, ...change };
    for (const l of this.listeners) l();
  }
}
