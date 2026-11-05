import { _electron as electron, expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const appDir = path.resolve(__dirname, '../..');
// root로 실행되는 Linux 컨테이너에서는 Chromium 프로세스 샌드박스를 끌 수밖에 없다 (BrowserWindow sandbox 옵션과 무관).
const needsNoSandbox = process.platform === 'linux' && process.getuid?.() === 0;

test('앱이 뜨고 가짜 엔진으로 ready 상태가 된다', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-e2e-'));
  const pidFile = path.join(userData, 'engine.pid');
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  const app = await electron.launch({
    args: [...(needsNoSandbox ? ['--no-sandbox'] : []), path.join(appDir, '.vite/build/main.js')],
    env: {
      ...env,
      FAKE_ENGINE_PID_FILE: pidFile,
      ARTEX_USER_DATA: userData,
      ARTEX_ENGINE_BINARY: process.execPath,
      ARTEX_ENGINE_ARGS_PREFIX: JSON.stringify([path.join(appDir, 'test/fixtures/fake-engine.mjs')]),
    },
  });
  const win = await app.firstWindow();
  await expect(win.getByText('프로젝트 추가 후 새 스레드 시작')).toBeVisible({ timeout: 30_000 });
  await expect(win.getByRole('status')).toHaveCount(0, { timeout: 30_000 });
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return (w.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences();
  });
  expect(prefs).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true });
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  await app.close();
  const gone = async () => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === 'ESRCH';
    }
  };
  const deadline = Date.now() + 5000;
  while (!(await gone()) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  expect(await gone()).toBe(true);
});

test('두 번째 실행은 즉시 종료되고 기존 인스턴스가 second-instance를 받는다', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  Object.assign(env, {
    ARTEX_USER_DATA: userData,
    ARTEX_ENGINE_BINARY: process.execPath,
    ARTEX_ENGINE_ARGS_PREFIX: JSON.stringify([path.join(appDir, 'test/fixtures/fake-engine.mjs')]),
  });
  const args = [...(needsNoSandbox ? ['--no-sandbox'] : []), path.join(appDir, '.vite/build/main.js')];
  const app = await electron.launch({ args, env });
  let second: ReturnType<typeof spawn> | undefined;
  try {
    const win = await app.firstWindow();
    await expect(win.getByText('프로젝트 추가 후 새 스레드 시작')).toBeVisible({ timeout: 30_000 });
    await app.evaluate(({ app: a }) => {
      (globalThis as { __second?: number }).__second = 0;
      a.on('second-instance', () => {
        (globalThis as { __second?: number }).__second! += 1;
      });
    });
    const electronBin = require('electron') as unknown as string;
    second = spawn(electronBin, args, { env, stdio: 'ignore' });
    const code = await new Promise<number | null>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('두 번째 인스턴스가 종료되지 않음')), 20_000);
      second!.on('exit', (c) => {
        clearTimeout(t);
        resolve(c);
      });
    });
    expect(code).toBe(0);
    await expect.poll(() => app.evaluate(() => (globalThis as { __second?: number }).__second)).toBe(1);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    if (second && second.exitCode === null) second.kill();
    await app.close();
  }
});
