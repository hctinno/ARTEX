import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { EVENT_ENGINE_STATUS } from '../shared/ipc-contract';
import { EngineManager, type EngineStatus } from './engine';
import { resolveEngineBinary } from './engine-path';
import { registerIpcHandlers } from './ipc';
import { ThreadStore } from './thread-store';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

if (process.env.ARTEX_USER_DATA) app.setPath('userData', process.env.ARTEX_USER_DATA);

let window: BrowserWindow | null = null;

async function boot() {
  const store = new ThreadStore(path.join(app.getPath('userData'), 'threads.json'));
  const { binaryPath, argsPrefix } = resolveEngineBinary({
    env: process.env,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    platform: process.platform,
  });
  const engine = new EngineManager({
    binaryPath,
    argsPrefix,
    cwd: app.getPath('home'),
    log: (line) => console.log(`[engine] ${line}`),
  });

  registerIpcHandlers(ipcMain, {
    store,
    engine,
    pickDirectory: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  });

  engine.on('status', (status: EngineStatus) => window?.webContents.send(EVENT_ENGINE_STATUS, status));
  app.on('before-quit', () => void engine.stop());

  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'ARTEX',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  void engine.start().catch((error) => console.error(`[engine] ${String(error)}`));
}

app.whenReady().then(boot);
app.on('window-all-closed', () => app.quit());
