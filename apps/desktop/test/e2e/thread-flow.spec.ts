import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeOpenAI } from './fake-openai';

const appDir = path.resolve(__dirname, '../..');
const engineBin = path.join(appDir, 'resources', 'bin', process.platform === 'win32' ? 'goose.exe' : 'goose');
// root로 실행되는 Linux 컨테이너에서는 Chromium 프로세스 샌드박스를 끌 수밖에 없다 (shell.spec과 동일).
const needsNoSandbox = process.platform === 'linux' && process.getuid?.() === 0;

async function launch(llmUrl: string, project: string): Promise<ElectronApplication> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-flow-'));
  const app = await electron.launch({
    args: [...(needsNoSandbox ? ['--no-sandbox'] : []), path.join(appDir, '.vite/build/main.js')],
    env: {
      ...process.env,
      // `.vite/build/main.js`를 직접 실행하면 app.getAppPath()가 .vite/build가 되므로 엔진 경로를 명시한다.
      ARTEX_ENGINE_BINARY: engineBin,
      ARTEX_USER_DATA: path.join(root, 'userData'),
      GOOSE_PATH_ROOT: path.join(root, 'goose'),
      GOOSE_DISABLE_KEYRING: '1',
      GOOSE_PROVIDER: 'openai',
      GOOSE_MODEL: 'fake-model',
      OPENAI_API_KEY: 'test-key',
      OPENAI_HOST: llmUrl,
      OPENAI_BASE_PATH: 'v1/chat/completions',
      GOOSE_MODE: 'approve',
    },
  });
  // 실패 시 원인 확인용: main 프로세스 stdout/stderr(`[engine] …` 포함)를 모아 둔다.
  const logs: string[] = [];
  app.process().stdout?.on('data', (d) => logs.push(String(d)));
  app.process().stderr?.on('data', (d) => logs.push(String(d)));
  engineLogs = logs;
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, project);
  return app;
}

let engineLogs: string[] = [];
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('main-process.log', { body: engineLogs.join('') });
  engineLogs = [];
});

test.skip(!fs.existsSync(engineBin), `엔진 바이너리 없음: ${engineBin} (pnpm build:engine 필요)`);

test('Local 스레드: 지시 → 승인 → 도구 실행 → 응답, 사용자 말풍선 1개', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-proj-'));
  const llm = await startFakeOpenAI([
    { toolCall: { name: 'developer__shell', arguments: { command: 'echo artex-e2e' } } },
    { text: '명령 실행 완료' },
  ]);
  const app = await launch(llm.url, project);
  const win = await app.firstWindow();

  await expect(win.getByText('프로젝트 추가 후 새 스레드 시작')).toBeVisible({ timeout: 60_000 });
  await expect(win.getByRole('status')).toHaveCount(0, { timeout: 60_000 });

  await win.getByRole('button', { name: '프로젝트 추가' }).click();
  await win.getByRole('button', { name: `${path.basename(project)} 새 스레드` }).click();
  await expect(win.getByRole('heading', { name: '새 스레드' })).toBeVisible();

  await win.getByLabel('지시 입력').fill('에코 실행해줘');
  await win.getByLabel('지시 입력').press('Enter');

  const approval = win.getByRole('group', { name: '승인 요청' });
  await expect(approval).toBeVisible({ timeout: 60_000 });
  await expect(win.getByText('승인 대기')).toBeVisible();
  await approval.getByRole('button', { name: '승인' }).click();

  await expect(win.getByText('명령 실행 완료')).toBeVisible({ timeout: 60_000 });
  await expect(win.getByRole('navigation').getByText('완료', { exact: true })).toBeVisible();
  await expect(win.getByText('에코 실행해줘')).toHaveCount(1);

  await app.close();
  await llm.close();
});

test('승인 대기 중 중단 → 스레드가 대기 상태에 갇히지 않음', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-proj-'));
  const llm = await startFakeOpenAI([{ toolCall: { name: 'developer__shell', arguments: { command: 'echo never' } } }]);
  const app = await launch(llm.url, project);
  const win = await app.firstWindow();

  await expect(win.getByRole('status')).toHaveCount(0, { timeout: 60_000 });
  await win.getByRole('button', { name: '프로젝트 추가' }).click();
  await win.getByRole('button', { name: `${path.basename(project)} 새 스레드` }).click();
  await win.getByLabel('지시 입력').fill('실행');
  await win.getByLabel('지시 입력').press('Enter');

  await expect(win.getByRole('group', { name: '승인 요청' })).toBeVisible({ timeout: 60_000 });
  await win.getByRole('button', { name: '중단' }).click();

  await expect(win.getByText('중단됨')).toBeVisible({ timeout: 30_000 });
  await expect(win.getByRole('button', { name: '보내기' })).toBeVisible({ timeout: 30_000 });

  await app.close();
  await llm.close();
});
