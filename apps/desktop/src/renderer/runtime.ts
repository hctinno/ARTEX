import { SessionController, type ThreadRecord } from '@artex/core';
import { connectEngine, type EngineConnection } from './acp/connection';
import { AppStore } from './state/app-store';

export const appStore = new AppStore();
export const controller = new SessionController();

let connection: EngineConnection | null = null;
let generation = 0;
const attached = new Set<string>();
const pending = new Map<string, Promise<void>>();

/** 연결이 새로 설정되거나 끊길 때마다 버전이 오른다. UI 효과가 이를 구독해 재연결 후 세션을 다시 붙인다. */
let connectionVersion = 0;
const connectionListeners = new Set<() => void>();
export const connectionStore = {
  subscribe(l: () => void): () => void {
    connectionListeners.add(l);
    return () => connectionListeners.delete(l);
  },
  getVersion: () => connectionVersion,
};
function bumpConnection(): void {
  connectionVersion++;
  for (const l of [...connectionListeners]) l();
}

export function dedupe<K>(map: Map<K, Promise<void>>, key: K, fn: () => Promise<void>): Promise<void> {
  const existing = map.get(key);
  if (existing) return existing;
  const p = fn().finally(() => map.delete(key));
  map.set(key, p);
  return p;
}

/** 재연결 지연: 0.5s, 1s, 2s, 4s, 8s, 이후 10s 고정. attempt는 0부터. */
export function reconnectDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 10_000);
}

export interface ReconnectState {
  /** 마지막 연결 실패·끊김 사유. 연결에 성공하면 null. */
  error: string | null;
  /** 연속 실패 횟수(다음 지연 계산용). */
  attempt: number;
}

/**
 * 엔진 프로세스가 ready인 동안 ACP 소켓 연결을 유지한다.
 * 첫 연결 실패나 (대체되지 않은) 연결 끊김 시 백오프로 bootEngine을 다시 시도한다.
 */
export class Reconnector {
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: ReconnectState = { error: null, attempt: 0 };
  private listeners = new Set<() => void>();

  constructor(private readonly boot: () => Promise<void>) {}

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  getState(): ReconnectState {
    return this.state;
  }

  setReady(ready: boolean): void {
    if (ready === this.ready) return;
    this.ready = ready;
    this.clearTimer();
    if (ready) {
      void this.connectNow();
    } else {
      this.set({ error: null, attempt: 0 });
    }
  }

  /** 즉시 연결 시도(대기 중인 재시도는 취소). 엔진이 ready가 아니면 아무것도 하지 않는다. */
  async connectNow(): Promise<void> {
    if (!this.ready) return;
    this.clearTimer();
    try {
      await this.boot();
      this.set({ error: null, attempt: 0 });
    } catch (e) {
      this.retry(e instanceof Error ? e.message : String(e));
    }
  }

  /** 현재 연결이 (재연결로 대체되지 않고) 닫혔을 때. */
  onLost(message: string): void {
    this.retry(message);
  }

  private retry(message: string): void {
    if (!this.ready) return;
    this.clearTimer();
    const delay = reconnectDelay(this.state.attempt);
    this.set({ error: message, attempt: this.state.attempt + 1 });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connectNow();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(next: ReconnectState): void {
    this.state = next;
    for (const l of [...this.listeners]) l();
  }
}

export function getConnection(): EngineConnection | null {
  return connection;
}

export async function bootEngine(): Promise<void> {
  const url = (await window.artex.invoke('engine:getAcpUrl')) as string | null;
  if (!url) return;
  const gen = ++generation;
  connection?.close();
  attached.clear();
  let conn: EngineConnection;
  try {
    conn = await connectEngine(url, {
      onUpdate: (n) => controller.handleUpdate(n),
      onPermission: (r) => controller.handlePermission(r),
      onClose: () => {
        // 재연결 중 이전 연결이 닫히며 발생하는 onClose는 무시한다.
        if (gen !== generation) return;
        connection = null;
        attached.clear();
        controller.markEngineLost('엔진 연결 끊김');
        bumpConnection();
        reconnector.onLost('엔진 연결 끊김');
      },
    });
  } catch (e) {
    // WebSocket 오류는 Event로 올라오므로 사람이 읽을 수 있는 메시지로 바꾼다.
    throw e instanceof Error ? e : new Error('엔진 연결 실패');
  }
  if (gen !== generation) {
    conn.close();
    return;
  }
  connection = conn;
  attached.clear();
  controller.setPort(conn);
  bumpConnection();
}

export const reconnector = new Reconnector(bootEngine);

/** 진행 중 attach dedupe와 attached 표시는 연결 세대 단위다. 이전 연결의 attach가 새 연결 상태를 바꾸지 못한다. */
export function ensureThreadSession(thread: ThreadRecord): Promise<void> {
  if (attached.has(thread.id)) return Promise.resolve();
  const gen = generation;
  return dedupe(pending, `${gen}:${thread.id}`, () => attach(thread, gen));
}

async function attach(thread: ThreadRecord, gen: number): Promise<void> {
  if (thread.sessionId) {
    await controller.resume(thread.id, thread.sessionId, thread.cwd);
  } else {
    const sessionId = await controller.start(thread.id, thread.cwd);
    await appStore.setSessionId(thread.id, sessionId);
  }
  if (gen === generation) attached.add(thread.id);
}
