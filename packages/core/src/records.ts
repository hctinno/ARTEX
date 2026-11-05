export type ThreadKind = 'local' | 'worktree';

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

export interface ThreadRecord {
  id: string;
  projectId: string;
  kind: ThreadKind;
  title: string;
  cwd: string;
  branch: string | null;
  worktreePath: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
