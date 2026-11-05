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

export function getConnection(): EngineConnection | null {
  return connection;
}

export async function bootEngine(): Promise<void> {
  const url = (await window.artex.invoke('engine:getAcpUrl')) as string | null;
  if (!url) return;
  const gen = ++generation;
  connection?.close();
  attached.clear();
  const conn = await connectEngine(url, {
    onUpdate: (n) => controller.handleUpdate(n),
    onPermission: (r) => controller.handlePermission(r),
    onClose: () => {
      // 재연결 중 이전 연결이 닫히며 발생하는 onClose는 무시한다.
      if (gen !== generation) return;
      connection = null;
      attached.clear();
      controller.markEngineLost('엔진 연결 끊김');
      bumpConnection();
    },
  });
  if (gen !== generation) {
    conn.close();
    return;
  }
  connection = conn;
  attached.clear();
  controller.setPort(conn);
  bumpConnection();
}

export function ensureThreadSession(thread: ThreadRecord): Promise<void> {
  if (attached.has(thread.id)) return Promise.resolve();
  return dedupe(pending, thread.id, () => attach(thread));
}

async function attach(thread: ThreadRecord): Promise<void> {
  if (thread.sessionId) {
    await controller.resume(thread.id, thread.sessionId, thread.cwd);
  } else {
    const sessionId = await controller.start(thread.id, thread.cwd);
    await appStore.setSessionId(thread.id, sessionId);
  }
  attached.add(thread.id);
}
