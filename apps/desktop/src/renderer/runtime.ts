import { SessionController, type ThreadRecord } from '@artex/core';
import { connectEngine, type EngineConnection } from './acp/connection';
import { AppStore } from './state/app-store';

export const appStore = new AppStore();
export const controller = new SessionController();

let connection: EngineConnection | null = null;
let generation = 0;
const attached = new Set<string>();

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
    },
  });
  if (gen !== generation) {
    conn.close();
    return;
  }
  connection = conn;
  controller.setPort(conn);
}

export async function ensureThreadSession(thread: ThreadRecord): Promise<void> {
  if (attached.has(thread.id)) return;
  if (thread.sessionId) {
    await controller.resume(thread.id, thread.sessionId, thread.cwd);
  } else {
    const sessionId = await controller.start(thread.id, thread.cwd);
    await appStore.setSessionId(thread.id, sessionId);
  }
  attached.add(thread.id);
}
