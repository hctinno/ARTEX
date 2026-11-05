import type { PermissionRequestLike, PermissionResponseLike } from './acp-types';
import { isKnownUpdate } from './acp-types';
import { normalizeConfigOptions, type ConfigOptionView } from './config-options';
import { availableChoices, pickOptionId } from './permission';
import { nextStatus, type StatusEvent, type ThreadStatus } from './thread-status';
import { appendUserText, applyUpdate, type PermissionChoice, type TimelineItem } from './timeline';

export interface AgentPort {
  newSession(cwd: string): Promise<{ sessionId: string; configOptions: unknown }>;
  loadSession(sessionId: string, cwd: string): Promise<{ configOptions: unknown }>;
  prompt(sessionId: string, text: string): Promise<{ stopReason: string }>;
  cancel(sessionId: string): Promise<void>;
  setConfigOption(sessionId: string, configId: string, value: string): Promise<{ configOptions: unknown }>;
}

export interface ThreadRuntime {
  status: ThreadStatus;
  items: TimelineItem[];
  configOptions: ConfigOptionView[];
}

interface PendingPermission {
  threadId: string;
  request: PermissionRequestLike;
  resolve: (r: PermissionResponseLike) => void;
}

const EMPTY: ThreadRuntime = Object.freeze({ status: 'idle', items: [], configOptions: [] }) as ThreadRuntime;

function describe(request: PermissionRequestLike): string {
  const input = request.toolCall.rawInput;
  if (input && typeof input === 'object' && typeof (input as { command?: unknown }).command === 'string') {
    return (input as { command: string }).command;
  }
  return input === undefined ? '' : JSON.stringify(input);
}

export class SessionController {
  private port: AgentPort | null = null;
  private runtimes = new Map<string, ThreadRuntime>();
  private sessionToThread = new Map<string, string>();
  private threadToSession = new Map<string, string>();
  private pending = new Map<string, PendingPermission>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private version = 0;

  getVersion(): number {
    return this.version;
  }

  setPort(port: AgentPort): void {
    this.port = port;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getThread(threadId: string): ThreadRuntime {
    return this.runtimes.get(threadId) ?? EMPTY;
  }

  async start(threadId: string, cwd: string): Promise<string> {
    const { sessionId, configOptions } = await this.requirePort().newSession(cwd);
    this.attach(threadId, sessionId, configOptions);
    return sessionId;
  }

  async resume(threadId: string, sessionId: string, cwd: string): Promise<void> {
    this.attach(threadId, sessionId, []);
    const { configOptions } = await this.requirePort().loadSession(sessionId, cwd);
    this.patch(threadId, { configOptions: normalizeConfigOptions(configOptions) });
  }

  async send(threadId: string, text: string): Promise<void> {
    const sessionId = this.requireSession(threadId);
    const current = this.getThread(threadId);
    this.patch(threadId, {
      items: appendUserText(current.items, text),
      status: nextStatus(current.status, { type: 'prompt_started' }),
    });
    try {
      const { stopReason } = await this.requirePort().prompt(sessionId, text);
      this.transition(threadId, { type: 'prompt_finished', stopReason });
    } catch (error) {
      this.fail(threadId, error instanceof Error ? error.message : String(error));
    }
  }

  async cancel(threadId: string): Promise<void> {
    const sessionId = this.requireSession(threadId);
    this.cancelPending(threadId);
    await this.requirePort().cancel(sessionId);
  }

  async setConfig(threadId: string, configId: string, value: string): Promise<void> {
    const sessionId = this.requireSession(threadId);
    const { configOptions } = await this.requirePort().setConfigOption(sessionId, configId, value);
    this.patch(threadId, { configOptions: normalizeConfigOptions(configOptions) });
  }

  handleUpdate(notification: { sessionId: string; update: unknown }): void {
    const threadId = this.sessionToThread.get(notification.sessionId);
    if (!threadId || !isKnownUpdate(notification.update)) return;
    this.patch(threadId, { items: applyUpdate(this.getThread(threadId).items, notification.update) });
  }

  handlePermission(request: PermissionRequestLike): Promise<PermissionResponseLike> {
    const threadId = this.sessionToThread.get(request.sessionId);
    if (!threadId) return Promise.resolve({ outcome: { outcome: 'cancelled' } });
    const requestId = `perm-${++this.seq}`;
    const current = this.getThread(threadId);
    this.patch(threadId, {
      status: nextStatus(current.status, { type: 'permission_requested' }),
      items: [
        ...current.items,
        {
          kind: 'permission',
          id: `permission-${current.items.length}`,
          requestId,
          title: request.toolCall.title ?? '도구 실행 승인',
          detail: describe(request),
          available: availableChoices(request.options),
          resolved: null,
        },
      ],
    });
    return new Promise((resolve) => this.pending.set(requestId, { threadId, request, resolve }));
  }

  respond(threadId: string, requestId: string, choice: PermissionChoice): void {
    const entry = this.pending.get(requestId);
    if (!entry || entry.threadId !== threadId) return;
    const optionId = pickOptionId(entry.request.options, choice);
    if (optionId === null) return;
    this.pending.delete(requestId);
    this.markResolved(threadId, requestId, choice);
    this.transition(threadId, { type: 'permission_resolved' });
    entry.resolve({ outcome: { outcome: 'selected', optionId } });
  }

  markEngineLost(message: string): void {
    for (const [threadId, runtime] of this.runtimes) {
      this.cancelPending(threadId);
      if (runtime.status === 'running' || runtime.status === 'awaiting_approval') this.fail(threadId, message);
    }
  }

  private attach(threadId: string, sessionId: string, configOptions: unknown): void {
    this.sessionToThread.set(sessionId, threadId);
    this.threadToSession.set(threadId, sessionId);
    this.patch(threadId, { configOptions: normalizeConfigOptions(configOptions) });
  }

  private cancelPending(threadId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.threadId !== threadId) continue;
      this.pending.delete(requestId);
      this.markResolved(threadId, requestId, 'cancelled');
      entry.resolve({ outcome: { outcome: 'cancelled' } });
    }
  }

  private markResolved(threadId: string, requestId: string, resolved: PermissionChoice | 'cancelled'): void {
    const items = this.getThread(threadId).items.map((i) =>
      i.kind === 'permission' && i.requestId === requestId ? { ...i, resolved } : i
    );
    this.patch(threadId, { items });
  }

  private fail(threadId: string, message: string): void {
    const current = this.getThread(threadId);
    this.patch(threadId, {
      status: nextStatus(current.status, { type: 'failed' }),
      items: [...current.items, { kind: 'error', id: `error-${current.items.length}`, message }],
    });
  }

  private transition(threadId: string, event: StatusEvent): void {
    this.patch(threadId, { status: nextStatus(this.getThread(threadId).status, event) });
  }

  private patch(threadId: string, change: Partial<ThreadRuntime>): void {
    this.runtimes.set(threadId, { ...this.getThread(threadId), ...change });
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private requirePort(): AgentPort {
    if (!this.port) throw new Error('엔진 연결 전에는 세션을 사용할 수 없음');
    return this.port;
  }

  private requireSession(threadId: string): string {
    const sessionId = this.threadToSession.get(threadId);
    if (!sessionId) throw new Error(`세션 없는 스레드: ${threadId}`);
    return sessionId;
  }
}
