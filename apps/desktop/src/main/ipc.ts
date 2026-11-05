import { inputSchemas, INVOKE_CHANNELS, type InvokeChannel } from '../shared/ipc-contract';
import type { EngineStatus } from './engine';
import type { ThreadStore } from './thread-store';

export interface IpcDeps {
  store: ThreadStore;
  engine: { getAcpUrl(): string | null; getStatus(): EngineStatus };
  pickDirectory(): Promise<string | null>;
}

interface IpcLike {
  handle(channel: string, fn: (event: unknown, input: unknown) => unknown): void;
}

export function registerIpcHandlers(ipc: IpcLike, deps: IpcDeps): void {
  const impl: Record<InvokeChannel, (input: any) => unknown> = {
    'engine:getAcpUrl': () => deps.engine.getAcpUrl(),
    'engine:getStatus': () => deps.engine.getStatus(),
    'projects:list': () => deps.store.listProjects(),
    'projects:pick': async () => {
      const dir = await deps.pickDirectory();
      return dir === null ? null : deps.store.addProject(dir);
    },
    'threads:list': (input?: { projectId?: string }) => deps.store.listThreads(input?.projectId),
    'threads:create': (input: { projectId: string; title: string }) =>
      deps.store.createLocalThread(input.projectId, input.title),
    'threads:update': ({ id, ...patch }: { id: string; title?: string; sessionId?: string }) =>
      deps.store.updateThread(id, patch),
    'threads:delete': (input: { id: string }) => deps.store.deleteThread(input.id),
  };

  for (const channel of INVOKE_CHANNELS) {
    ipc.handle(channel, async (_event, input) => impl[channel](inputSchemas[channel].parse(input)));
  }
}
