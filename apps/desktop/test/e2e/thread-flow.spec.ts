import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokens } from '@artex/ui';
import { startFakeOpenAI } from './fake-openai';

const appDir = path.resolve(__dirname, '../..');
const engineBin = path.join(appDir, 'resources', 'bin', process.platform === 'win32' ? 'goose.exe' : 'goose');
// root로 실행되는 Linux 컨테이너에서는 Chromium 프로세스 샌드박스를 끌 수밖에 없다 (shell.spec과 동일).
const needsNoSandbox = process.platform === 'linux' && process.getuid?.() === 0;

async function launch(llmUrl: string, project: string, root: string): Promise<ElectronApplication> {
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

/**
 * 엔진(goose openai 프로바이더)이 보내는 chat 요청 중 검증에 쓰는 부분. 실제 관찰된 형태:
 * tools: [{ type: 'function', function: { name: 'shell', ... } }, ...]
 * messages: [..., { role: 'assistant', content: null, tool_calls: [...] }, { role: 'tool', content: '<출력 문자열>', tool_call_id }]
 * 세션 제목 생성용 보조 요청은 tools가 없다.
 */
type ChatRequest = {
  tools?: { type: string; function: { name: string } }[];
  messages: { role: string; content: unknown }[];
};
const agentRequests = (requests: unknown[]) =>
  (requests as ChatRequest[]).filter((r) => Array.isArray(r.tools) && r.tools.length > 0);
const toolOutputs = (r: ChatRequest): string[] =>
  r.messages
    .filter((m) => m.role === 'tool')
    .map((m) => {
      expect(typeof m.content).toBe('string');
      return m.content as string;
    });

/** 시나리오마다 임시 디렉터리를 만들고, 끝나면 앱·가짜 서버를 닫고 디렉터리를 지운다. */
async function withScenario(
  script: Parameters<typeof startFakeOpenAI>[0],
  body: (ctx: { app: ElectronApplication; llm: Awaited<ReturnType<typeof startFakeOpenAI>>; project: string }) => Promise<void>
) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-proj-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-flow-'));
  let llm: Awaited<ReturnType<typeof startFakeOpenAI>> | undefined;
  let app: ElectronApplication | undefined;
  try {
    llm = await startFakeOpenAI(script);
    app = await launch(llm.url, project, root);
    await body({ app, llm, project });
  } finally {
    await app?.close().catch(() => {});
    await llm?.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  }
}

test.skip(!fs.existsSync(engineBin), `엔진 바이너리 없음: ${engineBin} (pnpm build:engine 필요)`);

// 계산된 body 배경은 테마 토큰(tokens.bg: 라이트 #E9E9EE, 다크 #000000)과 같아야 다크 패스가 진짜다.
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

for (const scheme of ['light', 'dark'] as const) {
  test(`Local 스레드(${scheme}): 지시 → 승인 → 도구 실행 → 응답, 사용자 말풍선 1개`, async () => {
    await withScenario(
      [{ toolCall: { name: 'developer__shell', arguments: { command: 'echo artex-e2e' } } }, { text: '명령 실행 완료' }],
      async ({ app, llm, project }) => {
        const win = await app.firstWindow();
        // nativeTheme.themeSource는 Linux(xvfb)에서 prefers-color-scheme을 바꾸지 못해(관찰됨) CDP 미디어 에뮬레이션을 쓴다.
        await win.emulateMedia({ colorScheme: scheme });
        await expect
          .poll(() => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
          .toBe(scheme === 'dark');
        await expect.poll(() => win.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb(tokens[scheme].bg));

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

        // 승인 → 실제 셸 실행 → 출력이 LLM에 전달됐음을 요청 본문으로 증명한다.
        const agent = agentRequests(llm.requests);
        expect(agent.length).toBeGreaterThanOrEqual(2);
        expect(agent[0]!.tools!.map((t) => t.function.name).some((n) => n.includes('shell'))).toBe(true);
        expect(agent.slice(1).some((r) => toolOutputs(r).some((o) => o.includes('artex-e2e')))).toBe(true);
      }
    );
  });
}

test('승인 대기 중 중단 → 스레드가 대기 상태에 갇히지 않음', async () => {
  await withScenario(
    [{ toolCall: { name: 'developer__shell', arguments: { command: 'echo never' } } }, { text: '재시도 응답' }],
    async ({ app, llm, project }) => {
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

      // 중단 후 후속 지시가 정상 처리되는지 확인한다.
      await win.getByLabel('지시 입력').fill('다시 해줘');
      await win.getByLabel('지시 입력').press('Enter');
      await expect(win.getByText('재시도 응답')).toBeVisible({ timeout: 60_000 });
      await expect(win.getByRole('navigation').getByText('완료', { exact: true })).toBeVisible();
      await expect(win.getByText('승인 대기')).toHaveCount(0);

      // 중단된 도구(echo never)의 실행 출력은 LLM에 전달되지 않아야 한다.
      const agent = agentRequests(llm.requests);
      expect(agent.length).toBeGreaterThanOrEqual(2);
      const outputs = agent.flatMap(toolOutputs);
      expect(outputs.length).toBeGreaterThanOrEqual(1); // 중단된 호출에도 tool 결과 메시지는 있다(중단 안내)
      for (const o of outputs) expect(o).not.toContain('never');
    }
  );
});
