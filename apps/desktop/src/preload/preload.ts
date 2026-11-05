import { contextBridge, ipcRenderer } from 'electron';
import { EVENT_ENGINE_STATUS, INVOKE_CHANNELS, type InvokeChannel } from '../shared/ipc-contract';

const allowed = new Set<string>(INVOKE_CHANNELS);

contextBridge.exposeInMainWorld('artex', {
  invoke(channel: InvokeChannel, input?: unknown) {
    if (!allowed.has(channel)) return Promise.reject(new Error(`허용되지 않은 채널: ${channel}`));
    return ipcRenderer.invoke(channel, input);
  },
  onEngineStatus(cb: (status: unknown) => void) {
    const listener = (_e: unknown, status: unknown) => cb(status);
    ipcRenderer.on(EVENT_ENGINE_STATUS, listener);
    return () => ipcRenderer.off(EVENT_ENGINE_STATUS, listener);
  },
});
