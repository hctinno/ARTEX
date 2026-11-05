import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { EVENT_ENGINE_STATUS } from '../shared/ipc-contract';
import { EngineManager, type EngineStatus } from './engine';
import { resolveEngineBinary } from './engine-path';
import { registerIpcHandlers } from './ipc';
import { handleSquirrelEvent } from './squirrel';
import { ThreadStore } from './thread-store';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Squirrel.Windows 설치/갱신/제거 중 실행된 경우: 바로가기만 처리하고 곧바로 종료한다.
const squirrelHandled = handleSquirrelEvent(process.argv, process.platform, process.execPath, {
  spawn: (cmd, args, opts) => spawn(cmd, args, opts),
  quit: () => app.quit(),
});

// 단일 인스턴스 잠금은 userData 경로 기준이므로 경로를 먼저 정한다.
if (!app.isPackaged && process.env.ARTEX_USER_DATA) app.setPath('userData', process.env.ARTEX_USER_DATA);
const primaryInstance = !squirrelHandled && app.requestSingleInstanceLock();
if (!squirrelHandled && !primaryInstance) app.quit();

let window: BrowserWindow | null = null;
let quitting = false;

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

  engine.on('status', (status: EngineStatus) => {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(EVENT_ENGINE_STATUS, status);
    }
  });
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void engine
      .stop()
      .catch((error) => console.error(`[engine] ${String(error)}`))
      .finally(() => app.quit());
  });

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

  window.on('closed', () => {
    window = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  void engine.start().catch((error) => console.error(`[engine] ${String(error)}`));
}

if (primaryInstance) {
  // 두 번째 실행은 잠금을 얻지 못해 종료되고, 기존 창을 앞으로 가져온다.
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app
    .whenReady()
    .then(boot)
    .catch((error) => {
      console.error(`[boot] ${String(error)}`);
      dialog.showErrorBox('ARTEX 시작 실패', error instanceof Error ? error.message : String(error));
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
}
