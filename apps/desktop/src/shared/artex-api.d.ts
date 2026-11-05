import type { InvokeChannel } from './ipc-contract';

export interface EngineStatusView {
  state: 'starting' | 'ready' | 'restarting' | 'failed' | 'stopped';
  message?: string;
}

declare global {
  interface Window {
    artex: {
      invoke(channel: InvokeChannel, input?: unknown): Promise<unknown>;
      onEngineStatus(cb: (status: EngineStatusView) => void): () => void;
    };
  }
}
