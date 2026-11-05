# ARTEX 1단계(골격 MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Goose 엔진(`goose serve`)에 ACP로 연결되는 Electron 데스크톱 앱을 만들어, 라이트·다크 iOS 스타일 Codex 레이아웃에서 Local 스레드 생성 → 지시 → 스트리밍 → 승인 → 결과 표시를 완주한다.

**Architecture:** `engine/`은 `aaif-goose/goose` 포크(git subtree). Electron main 프로세스가 `goose serve`를 127.0.0.1에 띄우고 스레드·프로젝트 기록을 JSON으로 관리한다. 렌더러는 `@agentclientprotocol/sdk` WebSocket 스트림으로 엔진에 직접 붙고, 순수 로직(상태 전이·타임라인·승인 매핑·세션 제어)은 `packages/core`에 두어 단위 테스트한다.

**Tech Stack:** pnpm workspace, TypeScript ~5.9.3, Electron 43.4.0, Electron Forge ^7.11.2 + Vite ^8.2.1, React ^19.2.8, Tailwind ^4.3.3, zod ^4.4.3, `@agentclientprotocol/sdk` 1.5.0, `@aaif/goose-acp-client`(engine 내 workspace 패키지), vitest ^4.1.11, @testing-library/react ^16.3.2, @playwright/test ^1.62.1, Rust(엔진 빌드)

**Spec:** `docs/superpowers/specs/2026-11-05-artex-ide-design.md`

## Global Constraints

- 엔진 기준 커밋: `aaif-goose/goose` `bfe8ccd23de1d2c47a4cb2970d522f093ae7f2ba`
- 대상 OS: Windows 1순위, macOS 2순위 (Linux는 CI 테스트 용도만)
- 엔진 서버: `--host 127.0.0.1`, 실행마다 새 비밀키 `GOOSE_SERVER__SECRET_KEY`, `GOOSE_DISABLE_TELEMETRY=1`
- 로그·오류 메시지에 비밀키 원문 출력 금지 (`REDACTED`로 치환)
- renderer: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- IPC: 허용 채널 목록 + zod 입력 검증
- Goose·Codex 명칭·로고 사용 금지. 제품명 `ARTEX`
- `LICENSE`(Apache 2.0)와 `NOTICE` 유지, 엔진 수정은 `docs/engine-patches.md`에 기록
- 디자인 토큰: 스펙 6.1 표의 값 그대로. 본문 대비 4.5:1 이상, 행·버튼 높이 44px 이상(보조 칩 36px 허용)
- UI 문구: 한국어, 개조식·명사형
- 1단계 제외: Worktree, Review 패널, 터미널, 샌드박스, PR, 스킬, 자동화, MCP 관리 화면

## Review Focus

- 엔진이 실행 중 비정상 종료 → 진행 중 스레드는 무한 "실행 중"이 아니라 오류 상태로 바뀌고, 재시작은 최대 3회 후 중단 (Task 6, Task 7 테스트)
- 승인 대기 중 사용자가 중단 → 대기 중인 승인 요청이 `cancelled`로 응답되고 스레드가 대기 상태에 갇히지 않음 (Task 6 테스트)
- 두 스레드가 동시에 스트리밍 → 이벤트가 `sessionId`로 정확한 스레드에만 쌓임 (Task 6 테스트)
- 존재하지 않는 경로·파일 경로를 프로젝트로 추가 → 거부되고 기록 파일은 변하지 않음 (Task 8 테스트)
- 기록 파일(`threads.json`) 손상 → 앱이 죽지 않고 손상본을 백업한 뒤 빈 상태로 시작 (Task 8 테스트)

---

## File Structure

```
ARTEX/
├─ package.json                    루트 스크립트, 공통 devDependencies
├─ pnpm-workspace.yaml             workspace 범위, hoisted linker
├─ tsconfig.base.json              공통 TS 설정
├─ vitest.config.ts                packages/*, apps/desktop 단위 테스트 프로젝트
├─ NOTICE                          Apache 2.0 고지 + 수정 사실
├─ docs/engine-patches.md          엔진 수정 지점 기록
├─ scripts/build-engine.mjs        cargo로 goose 빌드 → apps/desktop/resources/bin
├─ engine/                         aaif-goose/goose subtree (수정 최소화)
├─ packages/ui/
│   ├─ src/tokens.ts               라이트·다크 토큰 값
│   ├─ src/contrast.ts             WCAG 대비 계산
│   ├─ src/theme.css               CSS 변수 (prefers-color-scheme)
│   └─ test/tokens.test.ts
├─ packages/core/
│   ├─ src/records.ts              ProjectRecord, ThreadRecord 타입
│   ├─ src/thread-status.ts        스레드 상태 전이
│   ├─ src/acp-types.ts            ACP 업데이트·승인 최소 타입
│   ├─ src/timeline.ts             ACP 업데이트 → 타임라인 항목
│   ├─ src/permission.ts           승인 선택 → optionId
│   ├─ src/config-options.ts       session configOptions 정규화
│   ├─ src/session-controller.ts   스레드별 세션 제어
│   ├─ src/index.ts
│   └─ test/*.test.ts
└─ apps/desktop/
    ├─ package.json, forge.config.ts, vite.*.config.mts, index.html
    ├─ resources/bin/              빌드된 goose 실행 파일 (git 제외)
    ├─ src/shared/ipc-contract.ts  IPC 채널·스키마
    ├─ src/main/engine-urls.ts     URL 생성, 비밀키 마스킹
    ├─ src/main/engine.ts          EngineManager
    ├─ src/main/thread-store.ts    ThreadStore
    ├─ src/main/ipc.ts             핸들러 등록
    ├─ src/main/main.ts            앱 진입점
    ├─ src/preload/preload.ts      window.artex API
    ├─ src/renderer/main.tsx, App.tsx, styles.css
    ├─ src/renderer/acp/connection.ts    SDK 어댑터 (AgentPort 구현)
    ├─ src/renderer/state/app-store.ts   프로젝트·스레드 목록 상태
    ├─ src/renderer/state/use-store.ts   useSyncExternalStore 훅
    ├─ src/renderer/components/*.tsx     Sidebar, ThreadView, Composer, ApprovalCard, ToolCallCard, Settings
    ├─ test/unit/*.test.ts(x)
    ├─ test/fixtures/fake-engine.mjs     /status만 응답하는 가짜 엔진
    └─ test/e2e/*.ts                     Playwright (실제 엔진 + 가짜 OpenAI 서버)
```

---

### Task 1: 모노레포 골격, 엔진 subtree, 엔진 빌드 스크립트

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `NOTICE`, `docs/engine-patches.md`, `scripts/build-engine.mjs`, `scripts/build-engine.test.mjs`
- Create (subtree): `engine/**`

**Interfaces:**
- Produces: `pnpm build:engine` → `apps/desktop/resources/bin/goose` (Windows: `goose.exe`). `resolveEngineOutput(platform)` 함수(`scripts/build-engine.mjs` export)

- [ ] **Step 1: 엔진 subtree 추가**

```bash
git fetch https://github.com/aaif-goose/goose.git main
git subtree add --prefix=engine bfe8ccd23de1d2c47a4cb2970d522f093ae7f2ba --squash -m "chore: import goose engine at bfe8ccd"
ls engine/Cargo.toml engine/LICENSE engine/ui/goose-acp-client/package.json
```

Expected: 세 파일 경로가 출력된다.

- [ ] **Step 2: 루트 설정 파일 작성**

`package.json`:

```json
{
  "name": "artex",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "postinstall": "pnpm --filter @aaif/goose-acp-client run build:ts",
    "build:engine": "node scripts/build-engine.mjs",
    "test": "vitest run",
    "test:scripts": "node --test scripts/",
    "typecheck": "pnpm -r --filter ./packages/* --filter ./apps/* run typecheck"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "~5.9.3",
    "vitest": "^4.1.11"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'engine/ui/goose-acp-client'
nodeLinker: hoisted
allowBuilds:
  '@modelcontextprotocol/ext-apps': true
  electron: true
  electron-winstaller: true
  esbuild: true
blockExoticSubdeps: false
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'ui', root: 'packages/ui', include: ['test/**/*.test.ts'] } },
      { test: { name: 'core', root: 'packages/core', include: ['test/**/*.test.ts'] } },
      {
        test: {
          name: 'desktop-main',
          root: 'apps/desktop',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'desktop-renderer',
          root: 'apps/desktop',
          include: ['test/unit/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['test/unit/setup-dom.ts'],
        },
      },
    ],
  },
});
```

`.gitignore`:

```
node_modules/
dist/
out/
.vite/
apps/desktop/resources/bin/
test-results/
playwright-report/
engine/target/
```

`NOTICE`:

```
ARTEX
Copyright 2026 HCT

This product includes software developed by the goose project
(https://github.com/aaif-goose/goose), licensed under the Apache License 2.0.
The original license is in engine/LICENSE.

Modifications to the goose source under engine/ are listed in
docs/engine-patches.md. ARTEX is not endorsed by the goose project or the
Agentic AI Foundation.
```

`docs/engine-patches.md`:

```markdown
# 엔진 수정 지점

기준: aaif-goose/goose bfe8ccd23de1d2c47a4cb2970d522f093ae7f2ba

| 날짜 | 파일 | 목적 | 업스트림 제안 |
|---|---|---|---|
| (없음) | | 1단계는 엔진 코드 수정 없음 | |
```

- [ ] **Step 3: 빌드 스크립트 출력 경로 테스트 작성**

`scripts/build-engine.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveEngineOutput } from './build-engine.mjs';

test('windows는 goose.exe를 resources/bin에 복사한다', () => {
  const out = resolveEngineOutput('win32', '/repo');
  assert.equal(out.source, path.join('/repo', 'engine', 'target', 'release', 'goose.exe'));
  assert.equal(out.target, path.join('/repo', 'apps', 'desktop', 'resources', 'bin', 'goose.exe'));
});

test('macOS·Linux는 확장자 없는 goose를 복사한다', () => {
  const out = resolveEngineOutput('darwin', '/repo');
  assert.equal(out.source, path.join('/repo', 'engine', 'target', 'release', 'goose'));
  assert.equal(out.target, path.join('/repo', 'apps', 'desktop', 'resources', 'bin', 'goose'));
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `node --test scripts/`
Expected: FAIL, `Cannot find module` 또는 `resolveEngineOutput is not a function`

- [ ] **Step 5: 빌드 스크립트 구현**

`scripts/build-engine.mjs`:

```js
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveEngineOutput(platform, repoRoot) {
  const exe = platform === 'win32' ? 'goose.exe' : 'goose';
  return {
    source: path.join(repoRoot, 'engine', 'target', 'release', exe),
    target: path.join(repoRoot, 'apps', 'desktop', 'resources', 'bin', exe),
  };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync(
    'cargo',
    ['build', '--release', '-p', 'goose-cli', '--bin', 'goose'],
    { cwd: path.join(repoRoot, 'engine'), stdio: 'inherit', shell: process.platform === 'win32' }
  );
  if (result.status !== 0) {
    console.error(`cargo build 실패 (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  const { source, target } = resolveEngineOutput(process.platform, repoRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
  console.log(`엔진 복사 완료: ${target}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test scripts/`
Expected: PASS 2 tests

- [ ] **Step 7: 설치와 엔진 빌드 확인**

Run: `pnpm install && pnpm build:engine && apps/desktop/resources/bin/goose --version`
Expected: `pnpm install` 성공(`@aaif/goose-acp-client` `build:ts` 실행), cargo 빌드 성공, 버전 문자열 출력. Rust가 없으면 `rust-toolchain.toml`(engine/) 기준 툴체인을 설치한 뒤 재실행한다.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json vitest.config.ts .gitignore NOTICE docs/engine-patches.md scripts/
git commit -m "chore: monorepo skeleton and engine build script"
```

---

### Task 2: 디자인 토큰 패키지 (`packages/ui`)

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/tokens.ts`, `packages/ui/src/contrast.ts`, `packages/ui/src/theme.css`, `packages/ui/src/index.ts`
- Test: `packages/ui/test/tokens.test.ts`

**Interfaces:**
- Produces: `tokens: Record<'light' | 'dark', ThemeTokens>`, `contrastRatio(fg: string, bg: string): number` (hex `#RRGGBB`만), CSS 변수 `--artex-<token>` (`theme.css`), import 경로 `@artex/ui`, `@artex/ui/theme.css`

- [ ] **Step 1: 패키지 파일 작성**

`packages/ui/package.json`:

```json
{
  "name": "@artex/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./theme.css": "./src/theme.css" },
  "scripts": { "typecheck": "tsc --noEmit -p ." }
}
```

`packages/ui/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/ui/test/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { contrastRatio, tokens } from '../src/index';

describe('contrastRatio', () => {
  it('흑백 대비는 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });
  it('같은 색은 1', () => {
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe.each(['light', 'dark'] as const)('%s 토큰 대비', (mode) => {
  const t = tokens[mode];
  it.each([
    ['text', 'pane'],
    ['text', 'card'],
    ['muted', 'pane'],
    ['muted', 'card'],
    ['addText', 'pane'],
    ['delText', 'pane'],
    ['warnText', 'pane'],
  ] as const)('%s on %s ≥ 4.5', (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it('강조색 위 흰 글자 ≥ 4.5', () => {
    expect(contrastRatio('#FFFFFF', t.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/theme.css'), 'utf8');
  it.each(Object.keys(tokens.light))('--artex-%s 변수가 정의돼 있다', (key) => {
    const name = `--artex-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`;
    expect(css).toContain(`${name}:`);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run --project ui`
Expected: FAIL, `Cannot find module '../src/index'`

- [ ] **Step 4: 토큰·대비·CSS 구현**

`packages/ui/src/tokens.ts`:

```ts
export interface ThemeTokens {
  bg: string;
  pane: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  addText: string;
  delText: string;
  warnText: string;
}

export const tokens: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    bg: '#E9E9EE',
    pane: '#FFFFFF',
    card: '#F3F3F6',
    text: '#1C1C1E',
    muted: '#6C6C70',
    accent: '#0B6BDB',
    addText: '#1B7A3C',
    delText: '#B3261E',
    warnText: '#8F4A00',
  },
  dark: {
    bg: '#000000',
    pane: '#161618',
    card: '#232326',
    text: '#F5F5F7',
    muted: '#A1A1A8',
    accent: '#1F6FE5',
    addText: '#5FD98A',
    delText: '#FF8A80',
    warnText: '#FFB340',
  },
};
```

`packages/ui/src/contrast.ts`:

```ts
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`hex 색만 지원: ${hex}`);
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => channel(parseInt(h, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
```

`packages/ui/src/index.ts`:

```ts
export { tokens, type ThemeTokens } from './tokens';
export { contrastRatio } from './contrast';
```

`packages/ui/src/theme.css`:

```css
:root {
  --artex-bg: #E9E9EE;
  --artex-pane: #FFFFFF;
  --artex-card: #F3F3F6;
  --artex-text: #1C1C1E;
  --artex-muted: #6C6C70;
  --artex-accent: #0B6BDB;
  --artex-add-text: #1B7A3C;
  --artex-del-text: #B3261E;
  --artex-warn-text: #8F4A00;
  --artex-fill: rgba(118, 118, 128, 0.12);
  --artex-add-bg: #E2F5E8;
  --artex-del-bg: #FDEBE9;
  --artex-warn-soft: #FFEFD6;
  --artex-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.05);
  --artex-radius-pane: 24px;
  --artex-radius-row: 12px;
  --artex-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
  --artex-mono: 'SF Mono', ui-monospace, 'JetBrains Mono', monospace;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --artex-bg: #000000;
    --artex-pane: #161618;
    --artex-card: #232326;
    --artex-text: #F5F5F7;
    --artex-muted: #A1A1A8;
    --artex-accent: #1F6FE5;
    --artex-add-text: #5FD98A;
    --artex-del-text: #FF8A80;
    --artex-warn-text: #FFB340;
    --artex-fill: rgba(120, 120, 128, 0.26);
    --artex-add-bg: rgba(48, 209, 88, 0.14);
    --artex-del-bg: rgba(255, 69, 58, 0.14);
    --artex-warn-soft: rgba(255, 159, 10, 0.18);
    --artex-shadow: none;
    color-scheme: dark;
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run --project ui`
Expected: PASS. 대비 테스트가 실패하면 토큰 값이 스펙 6.1과 다른지부터 확인한다. 스펙 값으로 실패하면 해당 토큰을 고치고 스펙 표도 같은 커밋에서 갱신한다.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): light/dark design tokens with contrast checks"
```

---

### Task 3: 레코드 타입과 스레드 상태 전이 (`packages/core`)

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/records.ts`, `packages/core/src/thread-status.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/thread-status.test.ts`

**Interfaces:**
- Produces:
  - `type ThreadKind = 'local' | 'worktree'`
  - `interface ProjectRecord { id: string; name: string; path: string; addedAt: string }`
  - `interface ThreadRecord { id: string; projectId: string; kind: ThreadKind; title: string; cwd: string; branch: string | null; worktreePath: string | null; sessionId: string | null; createdAt: string; updatedAt: string }`
  - `type ThreadStatus = 'idle' | 'running' | 'awaiting_approval' | 'done' | 'error'`
  - `type StatusEvent = { type: 'prompt_started' } | { type: 'permission_requested' } | { type: 'permission_resolved' } | { type: 'prompt_finished'; stopReason: string } | { type: 'failed' }`
  - `nextStatus(current: ThreadStatus, event: StatusEvent): ThreadStatus`
  - import 경로 `@artex/core`

- [ ] **Step 1: 패키지 파일 작성**

`packages/core/package.json`:

```json
{
  "name": "@artex/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p ." }
}
```

`packages/core/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`packages/core/src/records.ts`:

```ts
export type ThreadKind = 'local' | 'worktree';

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

export interface ThreadRecord {
  id: string;
  projectId: string;
  kind: ThreadKind;
  title: string;
  cwd: string;
  branch: string | null;
  worktreePath: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/core/test/thread-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextStatus, type ThreadStatus } from '../src/index';

describe('nextStatus', () => {
  it.each<ThreadStatus>(['idle', 'done', 'error'])('%s → prompt_started → running', (s) => {
    expect(nextStatus(s, { type: 'prompt_started' })).toBe('running');
  });
  it('running 중 prompt_started는 무시', () => {
    expect(nextStatus('running', { type: 'prompt_started' })).toBe('running');
  });
  it('running → permission_requested → awaiting_approval', () => {
    expect(nextStatus('running', { type: 'permission_requested' })).toBe('awaiting_approval');
  });
  it('awaiting_approval → permission_resolved → running', () => {
    expect(nextStatus('awaiting_approval', { type: 'permission_resolved' })).toBe('running');
  });
  it.each(['end_turn', 'max_tokens', 'max_turn_requests', 'refusal'])(
    'running → prompt_finished(%s) → done',
    (stopReason) => {
      expect(nextStatus('running', { type: 'prompt_finished', stopReason })).toBe('done');
    }
  );
  it('cancelled 종료는 idle', () => {
    expect(nextStatus('awaiting_approval', { type: 'prompt_finished', stopReason: 'cancelled' })).toBe('idle');
  });
  it.each<ThreadStatus>(['idle', 'running', 'awaiting_approval', 'done'])('%s → failed → error', (s) => {
    expect(nextStatus(s, { type: 'failed' })).toBe('error');
  });
  it('idle에서 permission_resolved는 상태 유지', () => {
    expect(nextStatus('idle', { type: 'permission_resolved' })).toBe('idle');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run --project core`
Expected: FAIL, `Cannot find module '../src/index'`

- [ ] **Step 4: 구현**

`packages/core/src/thread-status.ts`:

```ts
export type ThreadStatus = 'idle' | 'running' | 'awaiting_approval' | 'done' | 'error';

export type StatusEvent =
  | { type: 'prompt_started' }
  | { type: 'permission_requested' }
  | { type: 'permission_resolved' }
  | { type: 'prompt_finished'; stopReason: string }
  | { type: 'failed' };

export function nextStatus(current: ThreadStatus, event: StatusEvent): ThreadStatus {
  switch (event.type) {
    case 'prompt_started':
      return 'running';
    case 'permission_requested':
      return current === 'running' ? 'awaiting_approval' : current;
    case 'permission_resolved':
      return current === 'awaiting_approval' ? 'running' : current;
    case 'prompt_finished':
      if (current !== 'running' && current !== 'awaiting_approval') return current;
      return event.stopReason === 'cancelled' ? 'idle' : 'done';
    case 'failed':
      return 'error';
  }
}
```

`packages/core/src/index.ts`:

```ts
export * from './records';
export * from './thread-status';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run --project core`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): thread records and status transitions"
```

---

### Task 4: ACP 업데이트 → 타임라인 리듀서

**Files:**
- Create: `packages/core/src/acp-types.ts`, `packages/core/src/timeline.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/timeline.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `acp-types.ts`: `ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'`, `ContentLike`, `ToolContentLike`, `PlanEntryLike`, `KnownUpdate`, `isKnownUpdate(u: unknown): u is KnownUpdate`, `PermissionOptionLike { optionId: string; name: string; kind: string }`, `PermissionRequestLike { sessionId: string; toolCall: { toolCallId: string; title?: string | null; rawInput?: unknown }; options: PermissionOptionLike[] }`, `PermissionResponseLike = { outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' } }`
  - `timeline.ts`: `TimelineItem` 유니온, `applyUpdate(items: readonly TimelineItem[], update: KnownUpdate): TimelineItem[]`, `appendUserText(items, text): TimelineItem[]`

- [ ] **Step 1: ACP 최소 타입 작성**

`packages/core/src/acp-types.ts`:

```ts
export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ContentLike = { type: 'text'; text: string } | { type: string; [key: string]: unknown };

export type ToolContentLike =
  | { type: 'content'; content: ContentLike }
  | { type: 'diff'; path: string; oldText?: string | null; newText: string }
  | { type: 'terminal'; terminalId: string };

export interface PlanEntryLike {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: string;
}

export type KnownUpdate =
  | { sessionUpdate: 'user_message_chunk'; content: ContentLike }
  | { sessionUpdate: 'agent_message_chunk'; content: ContentLike }
  | { sessionUpdate: 'agent_thought_chunk'; content: ContentLike }
  | {
      sessionUpdate: 'tool_call';
      toolCallId: string;
      title: string;
      kind?: string;
      status?: ToolStatus;
      content?: ToolContentLike[];
    }
  | {
      sessionUpdate: 'tool_call_update';
      toolCallId: string;
      title?: string | null;
      status?: ToolStatus | null;
      content?: ToolContentLike[] | null;
    }
  | { sessionUpdate: 'plan'; entries: PlanEntryLike[] };

const KNOWN = new Set([
  'user_message_chunk',
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
]);

export function isKnownUpdate(u: unknown): u is KnownUpdate {
  return (
    typeof u === 'object' &&
    u !== null &&
    typeof (u as { sessionUpdate?: unknown }).sessionUpdate === 'string' &&
    KNOWN.has((u as { sessionUpdate: string }).sessionUpdate)
  );
}

export interface PermissionOptionLike {
  optionId: string;
  name: string;
  kind: string;
}

export interface PermissionRequestLike {
  sessionId: string;
  toolCall: { toolCallId: string; title?: string | null; rawInput?: unknown };
  options: PermissionOptionLike[];
}

export type PermissionResponseLike = {
  outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' };
};
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/core/test/timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyUpdate, appendUserText, isKnownUpdate, type TimelineItem } from '../src/index';

const text = (t: string) => ({ type: 'text' as const, text: t });

describe('applyUpdate', () => {
  it('연속 agent 조각은 하나로 합친다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('안') });
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('녕') });
    expect(items).toEqual([{ kind: 'agent', id: 'agent-0', text: '안녕' }]);
  });

  it('도구 호출 사이의 agent 조각은 새 항목', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('A') });
    items = applyUpdate(items, { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'shell' });
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('B') });
    expect(items.map((i) => i.kind)).toEqual(['agent', 'tool', 'agent']);
  });

  it('tool_call_update는 같은 toolCallId 항목을 갱신하고 출력·파일을 누적한다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, {
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'npm test',
      kind: 'execute',
      status: 'pending',
    });
    items = applyUpdate(items, {
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      content: [
        { type: 'content', content: text('14 passed') },
        { type: 'diff', path: 'src/a.ts', newText: 'x' },
      ],
    });
    expect(items[0]).toMatchObject({
      kind: 'tool',
      toolCallId: 't1',
      title: 'npm test',
      toolKind: 'execute',
      status: 'completed',
      output: '14 passed',
      files: ['src/a.ts'],
    });
  });

  it('없는 toolCallId 업데이트는 새 도구 항목을 만든다', () => {
    const items = applyUpdate([], { sessionUpdate: 'tool_call_update', toolCallId: 'x', status: 'failed' });
    expect(items[0]).toMatchObject({ kind: 'tool', toolCallId: 'x', status: 'failed', title: '도구 실행' });
  });

  it('같은 파일은 한 번만 기록한다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'tool_call', toolCallId: 't', title: 'edit' });
    const diff = { type: 'diff' as const, path: 'a.ts', newText: '' };
    items = applyUpdate(items, { sessionUpdate: 'tool_call_update', toolCallId: 't', content: [diff] });
    items = applyUpdate(items, { sessionUpdate: 'tool_call_update', toolCallId: 't', content: [diff] });
    expect(items[0]).toMatchObject({ files: ['a.ts'] });
  });

  it('plan은 기존 plan 항목을 교체한다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'plan', entries: [{ content: 'a', status: 'pending' }] });
    items = applyUpdate(items, { sessionUpdate: 'plan', entries: [{ content: 'a', status: 'completed' }] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'plan', entries: [{ content: 'a', status: 'completed' }] });
  });

  it('text가 아닌 content 조각은 무시한다', () => {
    const items = applyUpdate([], { sessionUpdate: 'agent_message_chunk', content: { type: 'image', data: 'x' } });
    expect(items).toEqual([]);
  });

  it('입력 배열을 변경하지 않는다', () => {
    const before: TimelineItem[] = [{ kind: 'agent', id: 'agent-0', text: 'a' }];
    const frozen = Object.freeze([...before]);
    applyUpdate(frozen, { sessionUpdate: 'agent_message_chunk', content: text('b') });
    expect(before[0]).toEqual({ kind: 'agent', id: 'agent-0', text: 'a' });
  });
});

describe('appendUserText', () => {
  it('사용자 항목을 추가한다', () => {
    expect(appendUserText([], '고쳐줘')).toEqual([{ kind: 'user', id: 'user-0', text: '고쳐줘' }]);
  });
});

describe('isKnownUpdate', () => {
  it('알려진 종류만 통과', () => {
    expect(isKnownUpdate({ sessionUpdate: 'plan', entries: [] })).toBe(true);
    expect(isKnownUpdate({ sessionUpdate: 'usage_update' })).toBe(false);
    expect(isKnownUpdate(null)).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run --project core`
Expected: FAIL, `applyUpdate` 없음

- [ ] **Step 4: 구현**

`packages/core/src/timeline.ts`:

```ts
import type { ContentLike, KnownUpdate, PlanEntryLike, ToolContentLike, ToolStatus } from './acp-types';

export type PermissionChoice = 'allow_once' | 'allow_always' | 'reject';

export type TimelineItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | {
      kind: 'tool';
      id: string;
      toolCallId: string;
      title: string;
      toolKind: string;
      status: ToolStatus;
      output: string;
      files: string[];
    }
  | { kind: 'plan'; id: string; entries: PlanEntryLike[] }
  | {
      kind: 'permission';
      id: string;
      requestId: string;
      title: string;
      detail: string;
      available: PermissionChoice[];
      resolved: PermissionChoice | 'cancelled' | null;
    }
  | { kind: 'error'; id: string; message: string };

function textOf(content: ContentLike): string | null {
  return content.type === 'text' && typeof (content as { text?: unknown }).text === 'string'
    ? (content as { text: string }).text
    : null;
}

function appendText(
  items: readonly TimelineItem[],
  kind: 'user' | 'agent' | 'thought',
  chunk: string
): TimelineItem[] {
  const last = items[items.length - 1];
  if (last && last.kind === kind) {
    return [...items.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...items, { kind, id: `${kind}-${items.length}`, text: chunk }];
}

function mergeToolContent(output: string, files: string[], content: ToolContentLike[] | null | undefined) {
  let nextOutput = output;
  const nextFiles = [...files];
  for (const c of content ?? []) {
    if (c.type === 'content') {
      const t = textOf(c.content);
      if (t) nextOutput = nextOutput ? `${nextOutput}\n${t}` : t;
    } else if (c.type === 'diff' && !nextFiles.includes(c.path)) {
      nextFiles.push(c.path);
    }
  }
  return { output: nextOutput, files: nextFiles };
}

export function appendUserText(items: readonly TimelineItem[], text: string): TimelineItem[] {
  return [...items, { kind: 'user', id: `user-${items.length}`, text }];
}

export function applyUpdate(items: readonly TimelineItem[], update: KnownUpdate): TimelineItem[] {
  switch (update.sessionUpdate) {
    case 'user_message_chunk':
    case 'agent_message_chunk':
    case 'agent_thought_chunk': {
      const chunk = textOf(update.content);
      if (chunk === null) return [...items];
      const kind =
        update.sessionUpdate === 'user_message_chunk'
          ? 'user'
          : update.sessionUpdate === 'agent_message_chunk'
            ? 'agent'
            : 'thought';
      return appendText(items, kind, chunk);
    }
    case 'tool_call': {
      const merged = mergeToolContent('', [], update.content);
      return [
        ...items,
        {
          kind: 'tool',
          id: `tool-${items.length}`,
          toolCallId: update.toolCallId,
          title: update.title,
          toolKind: update.kind ?? 'other',
          status: update.status ?? 'pending',
          ...merged,
        },
      ];
    }
    case 'tool_call_update': {
      const index = items.findIndex((i) => i.kind === 'tool' && i.toolCallId === update.toolCallId);
      if (index === -1) {
        const merged = mergeToolContent('', [], update.content);
        return [
          ...items,
          {
            kind: 'tool',
            id: `tool-${items.length}`,
            toolCallId: update.toolCallId,
            title: update.title ?? '도구 실행',
            toolKind: 'other',
            status: update.status ?? 'pending',
            ...merged,
          },
        ];
      }
      const current = items[index] as Extract<TimelineItem, { kind: 'tool' }>;
      const merged = mergeToolContent(current.output, current.files, update.content);
      const next = {
        ...current,
        title: update.title ?? current.title,
        status: update.status ?? current.status,
        ...merged,
      };
      return [...items.slice(0, index), next, ...items.slice(index + 1)];
    }
    case 'plan': {
      const index = items.findIndex((i) => i.kind === 'plan');
      const entries = update.entries.map((e) => ({ ...e }));
      if (index === -1) return [...items, { kind: 'plan', id: `plan-${items.length}`, entries }];
      const current = items[index] as Extract<TimelineItem, { kind: 'plan' }>;
      return [...items.slice(0, index), { ...current, entries }, ...items.slice(index + 1)];
    }
  }
}
```

`packages/core/src/index.ts`:

```ts
export * from './records';
export * from './thread-status';
export * from './acp-types';
export * from './timeline';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run --project core`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): ACP session update timeline reducer"
```

---

### Task 5: 승인 옵션 매핑과 세션 설정 옵션 정규화

**Files:**
- Create: `packages/core/src/permission.ts`, `packages/core/src/config-options.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/permission.test.ts`, `packages/core/test/config-options.test.ts`

**Interfaces:**
- Consumes: `PermissionOptionLike`, `PermissionChoice` (Task 4)
- Produces:
  - `availableChoices(options: PermissionOptionLike[]): PermissionChoice[]`
  - `pickOptionId(options: PermissionOptionLike[], choice: PermissionChoice): string | null`
  - `interface ConfigOptionView { id: string; name: string; currentValue: string; options: { value: string; name: string }[] }`
  - `normalizeConfigOptions(raw: unknown): ConfigOptionView[]`
  - 상수 `COMPOSER_CONFIG_IDS = ['model', 'thinking_effort', 'mode'] as const`

엔진 근거: `engine/crates/goose/src/acp/response_builder.rs`의 `SessionConfigOption::select("provider" | "mode" | "model" | "thinking_effort", ...)`, 변경은 `session/setConfigOption { sessionId, configId, value }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/test/permission.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { availableChoices, pickOptionId } from '../src/index';

const full = [
  { optionId: 'o1', name: 'Allow', kind: 'allow_once' },
  { optionId: 'o2', name: 'Always', kind: 'allow_always' },
  { optionId: 'o3', name: 'Deny', kind: 'reject_once' },
];

describe('pickOptionId', () => {
  it('선택별 optionId', () => {
    expect(pickOptionId(full, 'allow_once')).toBe('o1');
    expect(pickOptionId(full, 'allow_always')).toBe('o2');
    expect(pickOptionId(full, 'reject')).toBe('o3');
  });
  it('reject_once가 없으면 reject_always 사용', () => {
    expect(pickOptionId([{ optionId: 'r', name: 'x', kind: 'reject_always' }], 'reject')).toBe('r');
  });
  it('없는 선택은 null', () => {
    expect(pickOptionId([full[0]!], 'allow_always')).toBeNull();
  });
});

describe('availableChoices', () => {
  it('제공된 선택만 반환', () => {
    expect(availableChoices([full[0]!, full[2]!])).toEqual(['allow_once', 'reject']);
  });
});
```

`packages/core/test/config-options.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeConfigOptions } from '../src/index';

describe('normalizeConfigOptions', () => {
  it('평면 select 옵션', () => {
    const raw = [
      {
        type: 'select',
        id: 'mode',
        name: 'Mode',
        currentValue: 'auto',
        options: [
          { value: 'auto', name: 'auto' },
          { value: 'approve', name: 'approve' },
        ],
      },
    ];
    expect(normalizeConfigOptions(raw)).toEqual([
      {
        id: 'mode',
        name: 'Mode',
        currentValue: 'auto',
        options: [
          { value: 'auto', name: 'auto' },
          { value: 'approve', name: 'approve' },
        ],
      },
    ]);
  });

  it('그룹 옵션은 펼친다', () => {
    const raw = [
      {
        type: 'select',
        id: 'model',
        name: 'Model',
        currentValue: 'b',
        options: [{ group: 'g', name: 'G', options: [{ value: 'a', name: 'A' }, { value: 'b', name: 'B' }] }],
      },
    ];
    expect(normalizeConfigOptions(raw)[0]!.options).toEqual([
      { value: 'a', name: 'A' },
      { value: 'b', name: 'B' },
    ]);
  });

  it('배열이 아니거나 형식이 틀린 항목은 버린다', () => {
    expect(normalizeConfigOptions(undefined)).toEqual([]);
    expect(normalizeConfigOptions([{ id: 1 }, null, { type: 'select', id: 'x' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run --project core`
Expected: FAIL, `pickOptionId` 없음

- [ ] **Step 3: 구현**

`packages/core/src/permission.ts`:

```ts
import type { PermissionOptionLike } from './acp-types';
import type { PermissionChoice } from './timeline';

const KINDS: Record<PermissionChoice, string[]> = {
  allow_once: ['allow_once'],
  allow_always: ['allow_always'],
  reject: ['reject_once', 'reject_always'],
};

export function pickOptionId(options: PermissionOptionLike[], choice: PermissionChoice): string | null {
  for (const kind of KINDS[choice]) {
    const found = options.find((o) => o.kind === kind);
    if (found) return found.optionId;
  }
  return null;
}

export function availableChoices(options: PermissionOptionLike[]): PermissionChoice[] {
  return (Object.keys(KINDS) as PermissionChoice[]).filter((c) => pickOptionId(options, c) !== null);
}
```

`packages/core/src/config-options.ts`:

```ts
export interface ConfigOptionView {
  id: string;
  name: string;
  currentValue: string;
  options: { value: string; name: string }[];
}

export const COMPOSER_CONFIG_IDS = ['model', 'thinking_effort', 'mode'] as const;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null;

function flatten(options: unknown): { value: string; name: string }[] {
  if (!Array.isArray(options)) return [];
  const out: { value: string; name: string }[] = [];
  for (const o of options) {
    if (!isObj(o)) continue;
    if (Array.isArray(o.options)) {
      out.push(...flatten(o.options));
    } else if (typeof o.value === 'string' && typeof o.name === 'string') {
      out.push({ value: o.value, name: o.name });
    }
  }
  return out;
}

export function normalizeConfigOptions(raw: unknown): ConfigOptionView[] {
  if (!Array.isArray(raw)) return [];
  const out: ConfigOptionView[] = [];
  for (const item of raw) {
    if (!isObj(item) || item.type !== 'select') continue;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.currentValue !== 'string') continue;
    out.push({ id: item.id, name: item.name, currentValue: item.currentValue, options: flatten(item.options) });
  }
  return out;
}
```

`packages/core/src/index.ts` 끝에 추가:

```ts
export * from './permission';
export * from './config-options';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run --project core`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): permission option mapping and config option normalization"
```

---

### Task 6: SessionController (스레드별 세션 제어)

**Files:**
- Create: `packages/core/src/session-controller.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/session-controller.test.ts`

**Interfaces:**
- Consumes: `nextStatus`, `applyUpdate`, `appendUserText`, `isKnownUpdate`, `availableChoices`, `pickOptionId`, `normalizeConfigOptions`, 타입들 (Task 3~5)
- Produces:

```ts
export interface AgentPort {
  newSession(cwd: string): Promise<{ sessionId: string; configOptions: unknown }>;
  loadSession(sessionId: string, cwd: string): Promise<{ configOptions: unknown }>;
  prompt(sessionId: string, text: string): Promise<{ stopReason: string }>;
  cancel(sessionId: string): Promise<void>;
  setConfigOption(sessionId: string, configId: string, value: string): Promise<{ configOptions: unknown }>;
}
export interface ThreadRuntime { status: ThreadStatus; items: TimelineItem[]; configOptions: ConfigOptionView[] }
export class SessionController {
  setPort(port: AgentPort): void;
  start(threadId: string, cwd: string): Promise<string>;           // sessionId 반환
  resume(threadId: string, sessionId: string, cwd: string): Promise<void>;
  send(threadId: string, text: string): Promise<void>;
  cancel(threadId: string): Promise<void>;
  setConfig(threadId: string, configId: string, value: string): Promise<void>;
  handleUpdate(notification: { sessionId: string; update: unknown }): void;
  handlePermission(request: PermissionRequestLike): Promise<PermissionResponseLike>;
  respond(threadId: string, requestId: string, choice: PermissionChoice): void;
  markEngineLost(message: string): void;
  getThread(threadId: string): ThreadRuntime;
  getVersion(): number;                                           // 모든 스레드 변경마다 증가
  subscribe(listener: () => void): () => void;
}
```

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/test/session-controller.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SessionController, type AgentPort } from '../src/index';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakePort(overrides: Partial<AgentPort> = {}): AgentPort {
  let n = 0;
  return {
    newSession: vi.fn(async () => ({ sessionId: `s${++n}`, configOptions: [] })),
    loadSession: vi.fn(async () => ({ configOptions: [] })),
    prompt: vi.fn(async () => ({ stopReason: 'end_turn' })),
    cancel: vi.fn(async () => {}),
    setConfigOption: vi.fn(async () => ({ configOptions: [] })),
    ...overrides,
  };
}

const chunk = (sessionId: string, text: string) => ({
  sessionId,
  update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
});

const permission = (sessionId: string) => ({
  sessionId,
  toolCall: { toolCallId: 'tc1', title: 'git push', rawInput: { command: 'git push' } },
  options: [
    { optionId: 'a1', name: '허용', kind: 'allow_once' },
    { optionId: 'a2', name: '항상', kind: 'allow_always' },
    { optionId: 'r1', name: '거부', kind: 'reject_once' },
  ],
});

describe('SessionController', () => {
  it('port 없이 start하면 오류', async () => {
    await expect(new SessionController().start('t1', '/p')).rejects.toThrow('엔진 연결 전');
  });

  it('send: 사용자 항목 추가 → running → done', async () => {
    const gate = deferred<{ stopReason: string }>();
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => gate.promise) }));
    await c.start('t1', '/p');
    const sending = c.send('t1', '고쳐줘');
    expect(c.getThread('t1').status).toBe('running');
    expect(c.getThread('t1').items[0]).toMatchObject({ kind: 'user', text: '고쳐줘' });
    gate.resolve({ stopReason: 'end_turn' });
    await sending;
    expect(c.getThread('t1').status).toBe('done');
  });

  it('두 스레드의 스트림은 sessionId로 분리된다', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    const s1 = await c.start('t1', '/a');
    const s2 = await c.start('t2', '/b');
    c.handleUpdate(chunk(s1, 'A'));
    c.handleUpdate(chunk(s2, 'B'));
    c.handleUpdate(chunk(s1, 'A2'));
    expect(c.getThread('t1').items).toEqual([{ kind: 'agent', id: 'agent-0', text: 'AA2' }]);
    expect(c.getThread('t2').items).toEqual([{ kind: 'agent', id: 'agent-0', text: 'B' }]);
  });

  it('모르는 sessionId·모르는 업데이트는 무시', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    await c.start('t1', '/a');
    c.handleUpdate(chunk('nope', 'x'));
    c.handleUpdate({ sessionId: 's1', update: { sessionUpdate: 'usage_update' } });
    expect(c.getThread('t1').items).toEqual([]);
  });

  it('승인 요청 → awaiting_approval → 승인 응답 → running', async () => {
    const gate = deferred<{ stopReason: string }>();
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => gate.promise) }));
    const sid = await c.start('t1', '/p');
    void c.send('t1', 'push');
    const answer = c.handlePermission(permission(sid));
    const card = c.getThread('t1').items.find((i) => i.kind === 'permission');
    expect(card).toMatchObject({
      title: 'git push',
      available: ['allow_once', 'allow_always', 'reject'],
      resolved: null,
    });
    expect(c.getThread('t1').status).toBe('awaiting_approval');
    c.respond('t1', card!.kind === 'permission' ? card!.requestId : '', 'allow_always');
    await expect(answer).resolves.toEqual({ outcome: { outcome: 'selected', optionId: 'a2' } });
    expect(c.getThread('t1').status).toBe('running');
    gate.resolve({ stopReason: 'end_turn' });
  });

  it('승인 대기 중 중단하면 cancelled로 응답하고 idle', async () => {
    const gate = deferred<{ stopReason: string }>();
    const port = fakePort({ prompt: vi.fn(() => gate.promise) });
    const c = new SessionController();
    c.setPort(port);
    const sid = await c.start('t1', '/p');
    const sending = c.send('t1', 'push');
    const answer = c.handlePermission(permission(sid));
    await c.cancel('t1');
    await expect(answer).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(port.cancel).toHaveBeenCalledWith(sid);
    gate.resolve({ stopReason: 'cancelled' });
    await sending;
    expect(c.getThread('t1').status).toBe('idle');
    expect(c.getThread('t1').items.find((i) => i.kind === 'permission')).toMatchObject({ resolved: 'cancelled' });
  });

  it('prompt 실패 → error 상태 + 오류 항목', async () => {
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(async () => Promise.reject(new Error('401 Unauthorized'))) }));
    await c.start('t1', '/p');
    await c.send('t1', 'x');
    expect(c.getThread('t1').status).toBe('error');
    expect(c.getThread('t1').items.at(-1)).toMatchObject({ kind: 'error', message: '401 Unauthorized' });
  });

  it('엔진 유실 시 진행 중 스레드는 error, 대기 승인은 cancelled', async () => {
    const c = new SessionController();
    c.setPort(fakePort({ prompt: vi.fn(() => new Promise(() => {})) }));
    const sid = await c.start('t1', '/p');
    await c.start('t2', '/q');
    void c.send('t1', 'x');
    const answer = c.handlePermission(permission(sid));
    c.markEngineLost('엔진 연결 끊김');
    await expect(answer).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(c.getThread('t1').status).toBe('error');
    expect(c.getThread('t2').status).toBe('idle');
  });

  it('start 시 configOptions를 정규화해 보관하고 setConfig로 갱신', async () => {
    const opts = [{ type: 'select', id: 'mode', name: 'Mode', currentValue: 'auto', options: [{ value: 'auto', name: 'auto' }] }];
    const next = [{ ...opts[0], currentValue: 'approve' }];
    const port = fakePort({
      newSession: vi.fn(async () => ({ sessionId: 's9', configOptions: opts })),
      setConfigOption: vi.fn(async () => ({ configOptions: next })),
    });
    const c = new SessionController();
    c.setPort(port);
    await c.start('t1', '/p');
    expect(c.getThread('t1').configOptions[0]!.currentValue).toBe('auto');
    await c.setConfig('t1', 'mode', 'approve');
    expect(port.setConfigOption).toHaveBeenCalledWith('s9', 'mode', 'approve');
    expect(c.getThread('t1').configOptions[0]!.currentValue).toBe('approve');
  });

  it('변경 시 구독자에게 알리고 해제 후에는 알리지 않는다', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    const listener = vi.fn();
    const off = c.subscribe(listener);
    await c.start('t1', '/p');
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    c.handleUpdate(chunk('s1', 'x'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('getThread는 변경이 없으면 같은 객체를 반환한다', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    await c.start('t1', '/p');
    expect(c.getThread('t1')).toBe(c.getThread('t1'));
  });

  it('다른 스레드 변경에도 version이 증가한다 (사이드바 상태 갱신용)', async () => {
    const c = new SessionController();
    c.setPort(fakePort());
    const s2 = await c.start('t2', '/q');
    const before = c.getVersion();
    c.handleUpdate(chunk(s2, 'x'));
    expect(c.getVersion()).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run --project core`
Expected: FAIL, `SessionController` 없음

- [ ] **Step 3: 구현**

`packages/core/src/session-controller.ts`:

```ts
import type { PermissionRequestLike, PermissionResponseLike } from './acp-types';
import { isKnownUpdate } from './acp-types';
import { normalizeConfigOptions, type ConfigOptionView } from './config-options';
import { availableChoices, pickOptionId } from './permission';
import { nextStatus, type StatusEvent, type ThreadStatus } from './thread-status';
import { appendUserText, applyUpdate, type PermissionChoice, type TimelineItem } from './timeline';

export interface AgentPort {
  newSession(cwd: string): Promise<{ sessionId: string; configOptions: unknown }>;
  loadSession(sessionId: string, cwd: string): Promise<{ configOptions: unknown }>;
  prompt(sessionId: string, text: string): Promise<{ stopReason: string }>;
  cancel(sessionId: string): Promise<void>;
  setConfigOption(sessionId: string, configId: string, value: string): Promise<{ configOptions: unknown }>;
}

export interface ThreadRuntime {
  status: ThreadStatus;
  items: TimelineItem[];
  configOptions: ConfigOptionView[];
}

interface PendingPermission {
  threadId: string;
  request: PermissionRequestLike;
  resolve: (r: PermissionResponseLike) => void;
}

const EMPTY: ThreadRuntime = Object.freeze({ status: 'idle', items: [], configOptions: [] }) as ThreadRuntime;

function describe(request: PermissionRequestLike): string {
  const input = request.toolCall.rawInput;
  if (input && typeof input === 'object' && typeof (input as { command?: unknown }).command === 'string') {
    return (input as { command: string }).command;
  }
  return input === undefined ? '' : JSON.stringify(input);
}

export class SessionController {
  private port: AgentPort | null = null;
  private runtimes = new Map<string, ThreadRuntime>();
  private sessionToThread = new Map<string, string>();
  private threadToSession = new Map<string, string>();
  private pending = new Map<string, PendingPermission>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private version = 0;

  getVersion(): number {
    return this.version;
  }

  setPort(port: AgentPort): void {
    this.port = port;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getThread(threadId: string): ThreadRuntime {
    return this.runtimes.get(threadId) ?? EMPTY;
  }

  async start(threadId: string, cwd: string): Promise<string> {
    const { sessionId, configOptions } = await this.requirePort().newSession(cwd);
    this.attach(threadId, sessionId, configOptions);
    return sessionId;
  }

  async resume(threadId: string, sessionId: string, cwd: string): Promise<void> {
    this.attach(threadId, sessionId, []);
    const { configOptions } = await this.requirePort().loadSession(sessionId, cwd);
    this.patch(threadId, { configOptions: normalizeConfigOptions(configOptions) });
  }

  async send(threadId: string, text: string): Promise<void> {
    const sessionId = this.requireSession(threadId);
    const current = this.getThread(threadId);
    this.patch(threadId, {
      items: appendUserText(current.items, text),
      status: nextStatus(current.status, { type: 'prompt_started' }),
    });
    try {
      const { stopReason } = await this.requirePort().prompt(sessionId, text);
      this.transition(threadId, { type: 'prompt_finished', stopReason });
    } catch (error) {
      this.fail(threadId, error instanceof Error ? error.message : String(error));
    }
  }

  async cancel(threadId: string): Promise<void> {
    const sessionId = this.requireSession(threadId);
    this.cancelPending(threadId);
    await this.requirePort().cancel(sessionId);
  }

  async setConfig(threadId: string, configId: string, value: string): Promise<void> {
    const sessionId = this.requireSession(threadId);
    const { configOptions } = await this.requirePort().setConfigOption(sessionId, configId, value);
    this.patch(threadId, { configOptions: normalizeConfigOptions(configOptions) });
  }

  handleUpdate(notification: { sessionId: string; update: unknown }): void {
    const threadId = this.sessionToThread.get(notification.sessionId);
    if (!threadId || !isKnownUpdate(notification.update)) return;
    this.patch(threadId, { items: applyUpdate(this.getThread(threadId).items, notification.update) });
  }

  handlePermission(request: PermissionRequestLike): Promise<PermissionResponseLike> {
    const threadId = this.sessionToThread.get(request.sessionId);
    if (!threadId) return Promise.resolve({ outcome: { outcome: 'cancelled' } });
    const requestId = `perm-${++this.seq}`;
    const current = this.getThread(threadId);
    this.patch(threadId, {
      status: nextStatus(current.status, { type: 'permission_requested' }),
      items: [
        ...current.items,
        {
          kind: 'permission',
          id: `permission-${current.items.length}`,
          requestId,
          title: request.toolCall.title ?? '도구 실행 승인',
          detail: describe(request),
          available: availableChoices(request.options),
          resolved: null,
        },
      ],
    });
    return new Promise((resolve) => this.pending.set(requestId, { threadId, request, resolve }));
  }

  respond(threadId: string, requestId: string, choice: PermissionChoice): void {
    const entry = this.pending.get(requestId);
    if (!entry || entry.threadId !== threadId) return;
    const optionId = pickOptionId(entry.request.options, choice);
    if (optionId === null) return;
    this.pending.delete(requestId);
    this.markResolved(threadId, requestId, choice);
    this.transition(threadId, { type: 'permission_resolved' });
    entry.resolve({ outcome: { outcome: 'selected', optionId } });
  }

  markEngineLost(message: string): void {
    for (const [threadId, runtime] of this.runtimes) {
      this.cancelPending(threadId);
      if (runtime.status === 'running' || runtime.status === 'awaiting_approval') this.fail(threadId, message);
    }
  }

  private attach(threadId: string, sessionId: string, configOptions: unknown): void {
    this.sessionToThread.set(sessionId, threadId);
    this.threadToSession.set(threadId, sessionId);
    this.patch(threadId, { configOptions: normalizeConfigOptions(configOptions) });
  }

  private cancelPending(threadId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.threadId !== threadId) continue;
      this.pending.delete(requestId);
      this.markResolved(threadId, requestId, 'cancelled');
      entry.resolve({ outcome: { outcome: 'cancelled' } });
    }
  }

  private markResolved(threadId: string, requestId: string, resolved: PermissionChoice | 'cancelled'): void {
    const items = this.getThread(threadId).items.map((i) =>
      i.kind === 'permission' && i.requestId === requestId ? { ...i, resolved } : i
    );
    this.patch(threadId, { items });
  }

  private fail(threadId: string, message: string): void {
    const current = this.getThread(threadId);
    this.patch(threadId, {
      status: nextStatus(current.status, { type: 'failed' }),
      items: [...current.items, { kind: 'error', id: `error-${current.items.length}`, message }],
    });
  }

  private transition(threadId: string, event: StatusEvent): void {
    this.patch(threadId, { status: nextStatus(this.getThread(threadId).status, event) });
  }

  private patch(threadId: string, change: Partial<ThreadRuntime>): void {
    this.runtimes.set(threadId, { ...this.getThread(threadId), ...change });
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private requirePort(): AgentPort {
    if (!this.port) throw new Error('엔진 연결 전에는 세션을 사용할 수 없음');
    return this.port;
  }

  private requireSession(threadId: string): string {
    const sessionId = this.threadToSession.get(threadId);
    if (!sessionId) throw new Error(`세션 없는 스레드: ${threadId}`);
    return sessionId;
  }
}
```

`packages/core/src/index.ts` 끝에 추가:

```ts
export * from './session-controller';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run --project core`
Expected: PASS (전체 core 테스트)

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): session controller with permission and cancel handling"
```

---

### Task 7: 엔진 URL·비밀키 마스킹과 EngineManager

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/src/main/engine-urls.ts`, `apps/desktop/src/main/engine.ts`, `apps/desktop/test/fixtures/fake-engine.mjs`
- Test: `apps/desktop/test/unit/engine-urls.test.ts`, `apps/desktop/test/unit/engine.test.ts`

**Interfaces:**
- Produces:
  - `buildEngineUrls(port: number, token: string): { httpBase: string; statusUrl: string; acpUrl: string }`
  - `redact(text: string, secret: string): string`
  - `type EngineState = 'starting' | 'ready' | 'restarting' | 'failed' | 'stopped'`
  - `interface EngineStatus { state: EngineState; message?: string }`
  - `class EngineManager extends EventEmitter` — 생성자 `(options: EngineOptions)`, `start(): Promise<string>`(acpUrl 반환), `stop(): Promise<void>`, `getAcpUrl(): string | null`, `getStatus(): EngineStatus`, 이벤트 `'status'(EngineStatus)`
  - `interface EngineOptions { binaryPath: string; argsPrefix?: string[]; cwd: string; env?: Record<string, string | undefined>; maxRestarts?: number; backoffBaseMs?: number; readinessTimeoutMs?: number; log?: (line: string) => void }`

엔진 근거: `engine/ui/desktop/src/gooseServe.ts` — 인자 `serve --host 127.0.0.1 --port <p>`, 준비 확인 `GET /status`, ACP `ws://127.0.0.1:<p>/acp?token=<secret>`, 환경 변수 `GOOSE_SERVER__SECRET_KEY`.

- [ ] **Step 1: 데스크톱 패키지 파일 작성**

`apps/desktop/package.json`:

```json
{
  "name": "@artex/desktop",
  "productName": "ARTEX",
  "version": "0.1.0",
  "private": true,
  "main": ".vite/build/main.js",
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make",
    "typecheck": "tsc --noEmit -p .",
    "e2e": "playwright test -c test/e2e/playwright.config.ts"
  },
  "dependencies": {
    "@aaif/goose-acp-client": "workspace:*",
    "@agentclientprotocol/sdk": "1.5.0",
    "@artex/core": "workspace:*",
    "@artex/ui": "workspace:*",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.11.2",
    "@electron-forge/maker-squirrel": "^7.11.2",
    "@electron-forge/maker-zip": "^7.11.2",
    "@electron-forge/plugin-vite": "^7.11.2",
    "@playwright/test": "^1.62.1",
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^5.1.4",
    "electron": "43.4.0",
    "jsdom": "^26.1.0",
    "tailwindcss": "^4.3.3",
    "vite": "^8.2.1"
  }
}
```

`apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node", "vite/client"] },
  "include": ["src", "test", "*.ts", "*.mts"]
}
```

Run: `pnpm install`
Expected: 성공

- [ ] **Step 2: URL·마스킹 실패 테스트 작성**

`apps/desktop/test/unit/engine-urls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildEngineUrls, redact } from '../../src/main/engine-urls';

describe('buildEngineUrls', () => {
  it('127.0.0.1 http·ws 주소를 만든다', () => {
    expect(buildEngineUrls(4123, 'abc+/=')).toEqual({
      httpBase: 'http://127.0.0.1:4123',
      statusUrl: 'http://127.0.0.1:4123/status',
      acpUrl: 'ws://127.0.0.1:4123/acp?token=abc%2B%2F%3D',
    });
  });
});

describe('redact', () => {
  it('원문과 URL 인코딩된 비밀키를 모두 가린다', () => {
    const secret = 'abc+/=';
    const line = `token=${secret} url=ws://x/acp?token=${encodeURIComponent(secret)}`;
    expect(redact(line, secret)).toBe('token=REDACTED url=ws://x/acp?token=REDACTED');
  });
  it('빈 비밀키는 원문 그대로', () => {
    expect(redact('hello', '')).toBe('hello');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: FAIL, 모듈 없음

- [ ] **Step 4: URL·마스킹 구현**

`apps/desktop/src/main/engine-urls.ts`:

```ts
export function buildEngineUrls(port: number, token: string) {
  const httpBase = `http://127.0.0.1:${port}`;
  const acp = new URL(`${httpBase}/acp`);
  acp.protocol = 'ws:';
  acp.searchParams.set('token', token);
  return { httpBase, statusUrl: `${httpBase}/status`, acpUrl: acp.toString() };
}

export function redact(text: string, secret: string): string {
  if (!secret) return text;
  return [secret, encodeURIComponent(secret)].reduce((acc, s) => acc.split(s).join('REDACTED'), text);
}
```

- [ ] **Step 5: 가짜 엔진 작성**

`apps/desktop/test/fixtures/fake-engine.mjs`:

```js
import http from 'node:http';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);
if (!process.env.GOOSE_SERVER__SECRET_KEY) {
  console.error('missing secret');
  process.exit(2);
}
console.log(`fake engine secret=${process.env.GOOSE_SERVER__SECRET_KEY}`);

const mode = process.env.FAKE_ENGINE_MODE ?? 'ok';
if (mode === 'crash-immediately') process.exit(3);

const server = http.createServer((req, res) => {
  res.writeHead(req.url === '/status' ? 200 : 404);
  res.end('ok');
});
server.listen(port, '127.0.0.1');

if (mode === 'crash-after-ready') setTimeout(() => process.exit(4), 300);
```

- [ ] **Step 6: EngineManager 실패 테스트 작성**

`apps/desktop/test/unit/engine.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { EngineManager, type EngineStatus } from '../../src/main/engine';

const fake = path.join(__dirname, '../fixtures/fake-engine.mjs');
const managers: EngineManager[] = [];

function create(mode: string, logs: string[] = []) {
  const m = new EngineManager({
    binaryPath: process.execPath,
    argsPrefix: [fake],
    cwd: process.cwd(),
    env: { FAKE_ENGINE_MODE: mode },
    backoffBaseMs: 20,
    readinessTimeoutMs: 3000,
    log: (line) => logs.push(line),
  });
  managers.push(m);
  return m;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.stop()));
});

describe('EngineManager', () => {
  it('준비되면 ready 상태와 토큰 포함 acpUrl', async () => {
    const m = create('ok');
    const url = await m.start();
    expect(url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/acp\?token=/);
    expect(m.getStatus().state).toBe('ready');
    expect(m.getAcpUrl()).toBe(url);
  });

  it('로그에 비밀키 원문이 남지 않는다', async () => {
    const logs: string[] = [];
    const m = create('ok', logs);
    const url = await m.start();
    const secret = decodeURIComponent(new URL(url).searchParams.get('token')!);
    await new Promise((r) => setTimeout(r, 100));
    expect(logs.join('\n')).toContain('secret=REDACTED');
    expect(logs.join('\n')).not.toContain(secret);
  });

  it('실행 직후 종료가 반복되면 3회 재시작 후 failed', async () => {
    const m = create('crash-immediately');
    const states: EngineStatus['state'][] = [];
    m.on('status', (s: EngineStatus) => states.push(s.state));
    await expect(m.start()).rejects.toThrow('엔진 시작 실패');
    expect(states.filter((s) => s === 'restarting')).toHaveLength(3);
    expect(m.getStatus().state).toBe('failed');
  });

  it('준비 후 비정상 종료되면 재시작해 다시 ready', async () => {
    const m = create('crash-after-ready');
    await m.start();
    const restarted = new Promise<void>((resolve) => {
      m.on('status', (s: EngineStatus) => s.state === 'restarting' && resolve());
    });
    await restarted;
    expect(['restarting', 'starting', 'ready']).toContain(m.getStatus().state);
  });

  it('stop 후에는 재시작하지 않는다', async () => {
    const m = create('ok');
    await m.start();
    await m.stop();
    await new Promise((r) => setTimeout(r, 200));
    expect(m.getStatus().state).toBe('stopped');
    expect(m.getAcpUrl()).toBeNull();
  });
});
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: FAIL, `EngineManager` 없음

- [ ] **Step 8: EngineManager 구현**

`apps/desktop/src/main/engine.ts`:

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { buildEngineUrls, redact } from './engine-urls';

export type EngineState = 'starting' | 'ready' | 'restarting' | 'failed' | 'stopped';
export interface EngineStatus {
  state: EngineState;
  message?: string;
}

export interface EngineOptions {
  binaryPath: string;
  argsPrefix?: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  maxRestarts?: number;
  backoffBaseMs?: number;
  readinessTimeoutMs?: number;
  log?: (line: string) => void;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class EngineManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private acpUrl: string | null = null;
  private status: EngineStatus = { state: 'stopped' };
  private stopping = false;
  private restarts = 0;
  private readonly maxRestarts: number;
  private readonly backoffBaseMs: number;
  private readonly readinessTimeoutMs: number;

  constructor(private readonly options: EngineOptions) {
    super();
    this.maxRestarts = options.maxRestarts ?? 3;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.readinessTimeoutMs = options.readinessTimeoutMs ?? 20_000;
  }

  getAcpUrl(): string | null {
    return this.acpUrl;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  async start(): Promise<string> {
    this.stopping = false;
    this.restarts = 0;
    return this.launchWithRetry();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.acpUrl = null;
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t']);
      } else {
        child.kill('SIGTERM');
      }
      await Promise.race([exited, sleep(3000)]);
    }
    this.setStatus({ state: 'stopped' });
  }

  private async launchWithRetry(): Promise<string> {
    for (;;) {
      try {
        this.setStatus({ state: 'starting' });
        const url = await this.launchOnce();
        this.restarts = 0;
        this.setStatus({ state: 'ready' });
        return url;
      } catch (error) {
        if (this.stopping) throw error;
        if (this.restarts >= this.maxRestarts) {
          const message = `엔진 시작 실패: ${error instanceof Error ? error.message : String(error)}`;
          this.setStatus({ state: 'failed', message });
          throw new Error(message);
        }
        this.restarts += 1;
        this.setStatus({ state: 'restarting', message: `재시작 ${this.restarts}/${this.maxRestarts}` });
        await sleep(this.backoffBaseMs * 2 ** (this.restarts - 1));
      }
    }
  }

  private async launchOnce(): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    const port = await freePort();
    const { statusUrl, acpUrl } = buildEngineUrls(port, secret);
    const args = [...(this.options.argsPrefix ?? []), 'serve', '--host', '127.0.0.1', '--port', String(port)];
    const child = spawn(this.options.binaryPath, args, {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...this.options.env,
        GOOSE_SERVER__SECRET_KEY: secret,
        GOOSE_DISABLE_TELEMETRY: '1',
      },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    const log = (chunk: Buffer) => this.options.log?.(redact(chunk.toString(), secret).trimEnd());
    child.stdout?.on('data', log);
    child.stderr?.on('data', log);

    let exitCode: number | null = null;
    const exited = new Promise<void>((resolve) =>
      child.once('exit', (code) => {
        exitCode = code;
        resolve();
      })
    );

    const deadline = Date.now() + this.readinessTimeoutMs;
    for (;;) {
      if (exitCode !== null || child.exitCode !== null) throw new Error(`엔진 종료 (exit ${exitCode ?? child.exitCode})`);
      if (Date.now() > deadline) {
        child.kill();
        throw new Error('준비 확인 시간 초과');
      }
      try {
        const res = await fetch(statusUrl);
        if (res.ok) break;
      } catch {
        // 아직 대기 중
      }
      await Promise.race([sleep(100), exited]);
    }

    this.acpUrl = acpUrl;
    void exited.then(() => this.onUnexpectedExit(child));
    return acpUrl;
  }

  private onUnexpectedExit(child: ChildProcess): void {
    if (this.stopping || this.child !== child) return;
    this.acpUrl = null;
    this.child = null;
    this.setStatus({ state: 'restarting', message: '엔진 비정상 종료' });
    void this.launchWithRetry().catch(() => {});
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.emit('status', status);
  }
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: PASS (engine-urls 3, engine 5)

- [ ] **Step 10: Commit**

```bash
git add apps/desktop pnpm-lock.yaml
git commit -m "feat(desktop): engine process manager with restart limit and secret redaction"
```

---

### Task 8: ThreadStore (프로젝트·스레드 기록)

**Files:**
- Create: `apps/desktop/src/main/thread-store.ts`
- Test: `apps/desktop/test/unit/thread-store.test.ts`

**Interfaces:**
- Consumes: `ProjectRecord`, `ThreadRecord` (`@artex/core`)
- Produces:
  - `class ThreadStore` — 생성자 `(filePath: string, deps?: { now?: () => Date; newId?: () => string })`
  - `listProjects(): ProjectRecord[]`, `addProject(dirPath: string): ProjectRecord`
  - `listThreads(projectId?: string): ThreadRecord[]` (updatedAt 내림차순)
  - `createLocalThread(projectId: string, title: string): ThreadRecord`
  - `updateThread(id: string, patch: { title?: string; sessionId?: string }): ThreadRecord`
  - `deleteThread(id: string): void`
  - `class StoreError extends Error { code: 'PROJECT_PATH_INVALID' | 'PROJECT_NOT_FOUND' | 'THREAD_NOT_FOUND' }`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/desktop/test/unit/thread-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StoreError, ThreadStore } from '../../src/main/thread-store';

let dir: string;
let file: string;
let clock: number;
let ids: number;

function store() {
  return new ThreadStore(file, {
    now: () => new Date(Date.UTC(2026, 10, 5, 0, 0, clock++)),
    newId: () => `id-${++ids}`,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-store-'));
  file = path.join(dir, 'threads.json');
  clock = 0;
  ids = 0;
});

describe('ThreadStore', () => {
  it('프로젝트 추가 후 재시작해도 남는다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const p = store().addProject(project);
    expect(p).toMatchObject({ id: 'id-1', path: project, name: path.basename(project) });
    expect(store().listProjects()).toEqual([p]);
  });

  it('같은 경로는 중복 추가하지 않는다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const a = s.addProject(project);
    expect(s.addProject(project)).toEqual(a);
    expect(s.listProjects()).toHaveLength(1);
  });

  it.each([
    ['없는 경로', () => path.join(dir, 'missing')],
    ['파일 경로', () => {
      const f = path.join(dir, 'a.txt');
      fs.writeFileSync(f, 'x');
      return f;
    }],
  ])('%s는 PROJECT_PATH_INVALID, 파일 불변', (_label, make) => {
    const s = store();
    expect(() => s.addProject(make())).toThrow(StoreError);
    try {
      s.addProject(make());
    } catch (e) {
      expect((e as StoreError).code).toBe('PROJECT_PATH_INVALID');
    }
    expect(fs.existsSync(file)).toBe(false);
  });

  it('Local 스레드는 프로젝트 경로를 cwd로 쓴다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const p = s.addProject(project);
    const t = s.createLocalThread(p.id, '토큰 갱신 수정');
    expect(t).toMatchObject({
      projectId: p.id,
      kind: 'local',
      title: '토큰 갱신 수정',
      cwd: project,
      branch: null,
      worktreePath: null,
      sessionId: null,
    });
  });

  it('없는 프로젝트에 스레드 생성은 PROJECT_NOT_FOUND', () => {
    expect(() => store().createLocalThread('nope', 'x')).toThrow(/PROJECT_NOT_FOUND|프로젝트 없음/);
  });

  it('updateThread는 updatedAt을 갱신하고 목록은 최신순', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const p = s.addProject(project);
    const a = s.createLocalThread(p.id, 'A');
    const b = s.createLocalThread(p.id, 'B');
    s.updateThread(a.id, { sessionId: 'sess-1' });
    expect(s.listThreads(p.id).map((t) => t.title)).toEqual(['A', 'B']);
    expect(store().listThreads()[0]).toMatchObject({ id: a.id, sessionId: 'sess-1' });
    expect(b.updatedAt < s.listThreads()[0]!.updatedAt).toBe(true);
  });

  it('deleteThread 후 목록에서 사라진다', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    const s = store();
    const t = s.createLocalThread(s.addProject(project).id, 'A');
    s.deleteThread(t.id);
    expect(s.listThreads()).toEqual([]);
    expect(() => s.deleteThread(t.id)).toThrow(StoreError);
  });

  it('손상된 파일은 백업 후 빈 상태로 시작', () => {
    fs.writeFileSync(file, '{ broken');
    const s = store();
    expect(s.listProjects()).toEqual([]);
    const backups = fs.readdirSync(dir).filter((n) => n.startsWith('threads.json.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, backups[0]!), 'utf8')).toBe('{ broken');
  });

  it('저장은 임시 파일 교체 방식 (tmp 파일이 남지 않음)', () => {
    const project = fs.mkdtempSync(path.join(dir, 'proj-'));
    store().addProject(project);
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: FAIL, `ThreadStore` 없음

- [ ] **Step 3: 구현**

`apps/desktop/src/main/thread-store.ts`:

```ts
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProjectRecord, ThreadRecord } from '@artex/core';

type StoreErrorCode = 'PROJECT_PATH_INVALID' | 'PROJECT_NOT_FOUND' | 'THREAD_NOT_FOUND';

export class StoreError extends Error {
  constructor(
    public readonly code: StoreErrorCode,
    message: string
  ) {
    super(`${code}: ${message}`);
  }
}

interface StoreData {
  version: 1;
  projects: ProjectRecord[];
  threads: ThreadRecord[];
}

const empty = (): StoreData => ({ version: 1, projects: [], threads: [] });

export class ThreadStore {
  private data: StoreData;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly filePath: string,
    deps: { now?: () => Date; newId?: () => string } = {}
  ) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.data = this.load();
  }

  listProjects(): ProjectRecord[] {
    return [...this.data.projects];
  }

  addProject(dirPath: string): ProjectRecord {
    const resolved = path.resolve(dirPath);
    let isDir = false;
    try {
      isDir = fs.statSync(resolved).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) throw new StoreError('PROJECT_PATH_INVALID', `폴더가 아님: ${resolved}`);
    const existing = this.data.projects.find((p) => p.path === resolved);
    if (existing) return existing;
    const project: ProjectRecord = {
      id: this.newId(),
      name: path.basename(resolved),
      path: resolved,
      addedAt: this.now().toISOString(),
    };
    this.data.projects.push(project);
    this.save();
    return project;
  }

  listThreads(projectId?: string): ThreadRecord[] {
    return this.data.threads
      .filter((t) => projectId === undefined || t.projectId === projectId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  createLocalThread(projectId: string, title: string): ThreadRecord {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) throw new StoreError('PROJECT_NOT_FOUND', `프로젝트 없음: ${projectId}`);
    const at = this.now().toISOString();
    const thread: ThreadRecord = {
      id: this.newId(),
      projectId,
      kind: 'local',
      title,
      cwd: project.path,
      branch: null,
      worktreePath: null,
      sessionId: null,
      createdAt: at,
      updatedAt: at,
    };
    this.data.threads.push(thread);
    this.save();
    return thread;
  }

  updateThread(id: string, patch: { title?: string; sessionId?: string }): ThreadRecord {
    const index = this.data.threads.findIndex((t) => t.id === id);
    if (index === -1) throw new StoreError('THREAD_NOT_FOUND', `스레드 없음: ${id}`);
    const next = { ...this.data.threads[index]!, ...patch, updatedAt: this.now().toISOString() };
    this.data.threads[index] = next;
    this.save();
    return next;
  }

  deleteThread(id: string): void {
    const before = this.data.threads.length;
    this.data.threads = this.data.threads.filter((t) => t.id !== id);
    if (this.data.threads.length === before) throw new StoreError('THREAD_NOT_FOUND', `스레드 없음: ${id}`);
    this.save();
  }

  private load(): StoreData {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      return empty();
    }
    try {
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.threads)) {
        throw new Error('형식 불일치');
      }
      return parsed;
    } catch {
      const backup = `${this.filePath}.corrupt-${this.now().getTime()}`;
      fs.renameSync(this.filePath, backup);
      return empty();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/thread-store.ts apps/desktop/test/unit/thread-store.test.ts
git commit -m "feat(desktop): JSON thread store with corruption recovery"
```

---

### Task 9: IPC 계약, 핸들러, preload

**Files:**
- Create: `apps/desktop/src/shared/ipc-contract.ts`, `apps/desktop/src/main/ipc.ts`, `apps/desktop/src/preload/preload.ts`, `apps/desktop/src/shared/artex-api.d.ts`
- Test: `apps/desktop/test/unit/ipc.test.ts`

**Interfaces:**
- Consumes: `ThreadStore`(Task 8), `EngineManager`의 `getAcpUrl()`·`getStatus()`(Task 7)
- Produces:
  - `INVOKE_CHANNELS = ['engine:getAcpUrl', 'engine:getStatus', 'projects:list', 'projects:pick', 'threads:list', 'threads:create', 'threads:update', 'threads:delete'] as const`
  - `type InvokeChannel = (typeof INVOKE_CHANNELS)[number]`
  - `inputSchemas: Record<InvokeChannel, z.ZodType>`
  - `EVENT_ENGINE_STATUS = 'engine:status'`
  - `registerIpcHandlers(ipc: { handle(channel: string, fn: (event: unknown, input: unknown) => unknown): void }, deps: IpcDeps): void`
  - `interface IpcDeps { store: ThreadStore; engine: { getAcpUrl(): string | null; getStatus(): EngineStatus }; pickDirectory(): Promise<string | null> }`
  - renderer 전역 `window.artex: { invoke(channel: InvokeChannel, input?: unknown): Promise<unknown>; onEngineStatus(cb: (s: EngineStatus) => void): () => void }`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/desktop/test/unit/ipc.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INVOKE_CHANNELS } from '../../src/shared/ipc-contract';
import { registerIpcHandlers } from '../../src/main/ipc';
import { ThreadStore } from '../../src/main/thread-store';

function setup(pick: string | null = null) {
  const handlers = new Map<string, (e: unknown, input: unknown) => unknown>();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-ipc-'));
  const store = new ThreadStore(path.join(dir, 'threads.json'));
  registerIpcHandlers(
    { handle: (c, fn) => handlers.set(c, fn) },
    {
      store,
      engine: { getAcpUrl: () => 'ws://127.0.0.1:1/acp?token=x', getStatus: () => ({ state: 'ready' }) },
      pickDirectory: vi.fn(async () => pick),
    }
  );
  const call = (c: string, input?: unknown) => Promise.resolve(handlers.get(c)!(null, input));
  return { handlers, call, dir, store };
}

describe('registerIpcHandlers', () => {
  it('허용 채널 전부를 등록한다', () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort());
  });

  it('projects:pick → 선택한 폴더를 프로젝트로 추가', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-p-'));
    const { call } = setup(folder);
    await expect(call('projects:pick')).resolves.toMatchObject({ path: folder });
    await expect(call('projects:list')).resolves.toHaveLength(1);
  });

  it('projects:pick 취소 → null', async () => {
    const { call } = setup(null);
    await expect(call('projects:pick')).resolves.toBeNull();
  });

  it('threads:create 입력 검증 — 빈 제목 거부', async () => {
    const { call } = setup();
    await expect(call('threads:create', { projectId: 'p', title: '' })).rejects.toThrow();
  });

  it('threads:create 입력 검증 — 추가 필드 거부', async () => {
    const { call } = setup();
    await expect(call('threads:create', { projectId: 'p', title: 'a', cwd: '/etc' })).rejects.toThrow();
  });

  it('threads:update는 title·sessionId만 받는다', async () => {
    const { call } = setup();
    await expect(call('threads:update', { id: 'x', worktreePath: '/tmp' })).rejects.toThrow();
  });

  it('engine:getAcpUrl', async () => {
    const { call } = setup();
    await expect(call('engine:getAcpUrl')).resolves.toBe('ws://127.0.0.1:1/acp?token=x');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: FAIL, 모듈 없음

- [ ] **Step 3: 계약 구현**

`apps/desktop/src/shared/ipc-contract.ts`:

```ts
import { z } from 'zod';

export const INVOKE_CHANNELS = [
  'engine:getAcpUrl',
  'engine:getStatus',
  'projects:list',
  'projects:pick',
  'threads:list',
  'threads:create',
  'threads:update',
  'threads:delete',
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

export const EVENT_ENGINE_STATUS = 'engine:status';

const none = z.undefined();

export const inputSchemas = {
  'engine:getAcpUrl': none,
  'engine:getStatus': none,
  'projects:list': none,
  'projects:pick': none,
  'threads:list': z.strictObject({ projectId: z.string().min(1).optional() }).optional(),
  'threads:create': z.strictObject({ projectId: z.string().min(1), title: z.string().trim().min(1).max(200) }),
  'threads:update': z.strictObject({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    sessionId: z.string().min(1).optional(),
  }),
  'threads:delete': z.strictObject({ id: z.string().min(1) }),
} satisfies Record<InvokeChannel, z.ZodType>;
```

- [ ] **Step 4: 핸들러 구현**

`apps/desktop/src/main/ipc.ts`:

```ts
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
```

- [ ] **Step 5: preload와 전역 타입 작성**

`apps/desktop/src/preload/preload.ts`:

```ts
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
```

`apps/desktop/src/shared/artex-api.d.ts`:

```ts
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
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/shared apps/desktop/src/main/ipc.ts apps/desktop/src/preload apps/desktop/test/unit/ipc.test.ts
git commit -m "feat(desktop): validated IPC contract and preload bridge"
```

---

### Task 10: Electron 셸 (Forge·Vite 설정, main 진입점, 렌더러 부트스트랩)

**Files:**
- Create: `apps/desktop/forge.config.ts`, `apps/desktop/vite.main.config.mts`, `apps/desktop/vite.preload.config.mts`, `apps/desktop/vite.renderer.config.mts`, `apps/desktop/index.html`, `apps/desktop/src/main/main.ts`, `apps/desktop/src/main/engine-path.ts`, `apps/desktop/src/renderer/main.tsx`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/styles.css`, `apps/desktop/test/e2e/playwright.config.ts`, `apps/desktop/test/e2e/shell.spec.ts`
- Test: `apps/desktop/test/unit/engine-path.test.ts`, `apps/desktop/test/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `EngineManager`, `ThreadStore`, `registerIpcHandlers`, `EVENT_ENGINE_STATUS`
- Produces:
  - `resolveEngineBinary(opts: { env: NodeJS.ProcessEnv; isPackaged: boolean; resourcesPath: string; appPath: string; platform: NodeJS.Platform }): { binaryPath: string; argsPrefix: string[] }`
  - 환경 변수 `ARTEX_ENGINE_BINARY`, `ARTEX_ENGINE_ARGS_PREFIX`(JSON 배열), `ARTEX_USER_DATA`(테스트용 userData 경로)
  - 렌더러 `App` 컴포넌트 (이 Task에서는 엔진 상태만 표시, Task 12에서 교체)

- [ ] **Step 1: 엔진 경로 결정 실패 테스트 작성**

`apps/desktop/test/unit/engine-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveEngineBinary } from '../../src/main/engine-path';

const base = { isPackaged: false, resourcesPath: '/res', appPath: '/app', platform: 'linux' as const };

describe('resolveEngineBinary', () => {
  it('환경 변수가 우선', () => {
    expect(
      resolveEngineBinary({ ...base, env: { ARTEX_ENGINE_BINARY: '/x/node', ARTEX_ENGINE_ARGS_PREFIX: '["/f.mjs"]' } })
    ).toEqual({ binaryPath: '/x/node', argsPrefix: ['/f.mjs'] });
  });
  it('개발 모드는 appPath/resources/bin', () => {
    expect(resolveEngineBinary({ ...base, env: {} }).binaryPath).toBe(path.join('/app', 'resources', 'bin', 'goose'));
  });
  it('패키징 + Windows는 resourcesPath/bin/goose.exe', () => {
    expect(resolveEngineBinary({ ...base, isPackaged: true, platform: 'win32', env: {} }).binaryPath).toBe(
      path.join('/res', 'bin', 'goose.exe')
    );
  });
  it('ARGS_PREFIX가 배열이 아니면 오류', () => {
    expect(() =>
      resolveEngineBinary({ ...base, env: { ARTEX_ENGINE_BINARY: '/n', ARTEX_ENGINE_ARGS_PREFIX: '"x"' } })
    ).toThrow('ARTEX_ENGINE_ARGS_PREFIX');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-main`
Expected: FAIL, 모듈 없음

- [ ] **Step 3: engine-path 구현**

`apps/desktop/src/main/engine-path.ts`:

```ts
import path from 'node:path';

export function resolveEngineBinary(opts: {
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  platform: NodeJS.Platform;
}): { binaryPath: string; argsPrefix: string[] } {
  if (opts.env.ARTEX_ENGINE_BINARY) {
    const prefix = opts.env.ARTEX_ENGINE_ARGS_PREFIX ? JSON.parse(opts.env.ARTEX_ENGINE_ARGS_PREFIX) : [];
    if (!Array.isArray(prefix) || !prefix.every((a) => typeof a === 'string')) {
      throw new Error('ARTEX_ENGINE_ARGS_PREFIX는 문자열 JSON 배열이어야 함');
    }
    return { binaryPath: opts.env.ARTEX_ENGINE_BINARY, argsPrefix: prefix };
  }
  const exe = opts.platform === 'win32' ? 'goose.exe' : 'goose';
  const root = opts.isPackaged ? opts.resourcesPath : path.join(opts.appPath, 'resources');
  return { binaryPath: path.join(root, 'bin', exe), argsPrefix: [] };
}
```

Run: `pnpm vitest run --project desktop-main`
Expected: PASS

- [ ] **Step 4: Forge·Vite 설정 작성**

`apps/desktop/forge.config.ts`:

```ts
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'ARTEX',
    executableName: 'artex',
    asar: true,
    extraResource: ['resources/bin'],
  },
  makers: [new MakerSquirrel({ name: 'artex', setupExe: 'ARTEX-Setup.exe' }), new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.mts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    }),
  ],
};

export default config;
```

`apps/desktop/vite.main.config.mts`:

```ts
import { defineConfig } from 'vite';
export default defineConfig({ build: { rollupOptions: { external: ['electron'] } } });
```

`apps/desktop/vite.preload.config.mts`:

```ts
import { defineConfig } from 'vite';
export default defineConfig({ build: { rollupOptions: { external: ['electron'] } } });
```

`apps/desktop/vite.renderer.config.mts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()] });
```

`apps/desktop/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ws://127.0.0.1:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:" />
    <title>ARTEX</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: main 진입점 작성**

`apps/desktop/src/main/main.ts`:

```ts
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
```

- [ ] **Step 6: 렌더러 부트스트랩 작성 (엔진 상태 표시)**

`apps/desktop/src/renderer/styles.css`:

```css
@import 'tailwindcss';
@import '@artex/ui/theme.css';

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--artex-bg);
  color: var(--artex-text);
  font-family: var(--artex-font);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.01em;
}
```

`apps/desktop/src/renderer/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import '../shared/artex-api';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`apps/desktop/src/renderer/App.tsx` (Task 12에서 전체 교체):

```tsx
import { useEffect, useState } from 'react';
import type { EngineStatusView } from '../shared/artex-api';

export function App() {
  const [status, setStatus] = useState<EngineStatusView>({ state: 'starting' });
  useEffect(() => {
    void window.artex.invoke('engine:getStatus').then((s) => setStatus(s as EngineStatusView));
    return window.artex.onEngineStatus(setStatus);
  }, []);
  return <div data-testid="engine-status">엔진 상태: {status.state}</div>;
}
```

- [ ] **Step 7: 셸 스모크 E2E 작성**

`apps/desktop/test/e2e/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', timeout: 120_000, workers: 1, reporter: 'list' });
```

`apps/desktop/test/e2e/shell.spec.ts`:

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const appDir = path.resolve(__dirname, '../..');

test('앱이 뜨고 가짜 엔진으로 ready 상태가 된다', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-e2e-'));
  const app = await electron.launch({
    args: [path.join(appDir, '.vite/build/main.js')],
    env: {
      ...process.env,
      ARTEX_USER_DATA: userData,
      ARTEX_ENGINE_BINARY: process.execPath,
      ARTEX_ENGINE_ARGS_PREFIX: JSON.stringify([path.join(appDir, 'test/fixtures/fake-engine.mjs')]),
      ELECTRON_RUN_AS_NODE: undefined,
    },
  });
  const win = await app.firstWindow();
  await expect(win.getByTestId('engine-status')).toHaveText('엔진 상태: ready', { timeout: 30_000 });
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return w.webContents.getLastWebPreferences();
  });
  expect(prefs).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true });
  await app.close();
});
```

참고: `process.execPath`는 Playwright 테스트 프로세스(Node)의 경로이므로 가짜 엔진은 Node로 실행된다. Electron 실행 파일 경로를 넣지 않는다.

- [ ] **Step 8: 빌드 후 스모크 실행**

Run: `cd apps/desktop && pnpm exec electron-forge package && pnpm e2e -- shell.spec.ts`

`electron-forge package`가 `.vite/build/main.js`를 생성한다. Linux CI에서는 `xvfb-run -a pnpm e2e -- shell.spec.ts`로 실행한다.

Expected: PASS 1 test

- [ ] **Step 9: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): electron shell with secure window and engine bootstrap"
```

---

### Task 11: 렌더러 ACP 어댑터와 상태 저장소

**Files:**
- Create: `apps/desktop/src/renderer/acp/connection.ts`, `apps/desktop/src/renderer/state/app-store.ts`, `apps/desktop/src/renderer/state/use-store.ts`, `apps/desktop/test/unit/setup-dom.ts`
- Test: `apps/desktop/test/unit/app-store.test.tsx`

**Interfaces:**
- Consumes: `SessionController`, `AgentPort`, `PermissionRequestLike` (`@artex/core`), `window.artex` (Task 9), `@agentclientprotocol/sdk` `client`, `methods`, `PROTOCOL_VERSION`, `@agentclientprotocol/sdk/experimental/ws-client` `createWebSocketStream`, `@aaif/goose-acp-client` `GooseExtClient`
- Produces:
  - `connectEngine(url: string, handlers: { onUpdate(n: { sessionId: string; update: unknown }): void; onPermission(r: PermissionRequestLike): Promise<PermissionResponseLike>; onClose(): void }): Promise<EngineConnection>`
  - `interface EngineConnection extends AgentPort { goose: GooseExtClient; close(): void }`
  - `class AppStore` — `getState(): AppState`, `subscribe(l): () => void`, `refresh(): Promise<void>`, `addProject(): Promise<void>`, `selectThread(id: string | null): void`, `createThread(projectId: string, title: string): Promise<ThreadRecord>`, `setSessionId(threadId: string, sessionId: string): Promise<void>`
  - `interface AppState { projects: ProjectRecord[]; threads: ThreadRecord[]; selectedThreadId: string | null; error: string | null }`
  - `useStore<T>(store: { subscribe(l: () => void): () => void }, read: () => T): T`

- [ ] **Step 1: DOM 테스트 설정 작성**

`apps/desktop/test/unit/setup-dom.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: AppStore 실패 테스트 작성**

`apps/desktop/test/unit/app-store.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from '../../src/renderer/state/app-store';

const project = { id: 'p1', name: 'web', path: '/w', addedAt: '2026-11-05T00:00:00.000Z' };
const thread = {
  id: 't1',
  projectId: 'p1',
  kind: 'local',
  title: 'A',
  cwd: '/w',
  branch: null,
  worktreePath: null,
  sessionId: null,
  createdAt: '2026-11-05T00:00:00.000Z',
  updatedAt: '2026-11-05T00:00:00.000Z',
};

let invoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke = vi.fn(async (channel: string) => {
    switch (channel) {
      case 'projects:list':
        return [project];
      case 'threads:list':
        return [thread];
      case 'projects:pick':
        return project;
      case 'threads:create':
        return thread;
      case 'threads:update':
        return { ...thread, sessionId: 's1' };
      default:
        return null;
    }
  });
  (globalThis as any).window.artex = { invoke, onEngineStatus: () => () => {} };
});

describe('AppStore', () => {
  it('refresh는 프로젝트·스레드를 불러온다', async () => {
    const s = new AppStore();
    await s.refresh();
    expect(s.getState()).toMatchObject({ projects: [project], threads: [thread], error: null });
  });

  it('createThread 후 선택 상태로 바뀐다', async () => {
    const s = new AppStore();
    await s.createThread('p1', 'A');
    expect(invoke).toHaveBeenCalledWith('threads:create', { projectId: 'p1', title: 'A' });
    expect(s.getState().selectedThreadId).toBe('t1');
  });

  it('IPC 실패는 error에 담기고 throw하지 않는다', async () => {
    invoke.mockRejectedValueOnce(new Error('PROJECT_PATH_INVALID: 폴더가 아님'));
    const s = new AppStore();
    await s.addProject();
    expect(s.getState().error).toContain('PROJECT_PATH_INVALID');
  });

  it('getState는 변경 전까지 같은 객체', async () => {
    const s = new AppStore();
    expect(s.getState()).toBe(s.getState());
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-renderer`
Expected: FAIL, 모듈 없음

- [ ] **Step 4: AppStore·useStore 구현**

`apps/desktop/src/renderer/state/app-store.ts`:

```ts
import type { ProjectRecord, ThreadRecord } from '@artex/core';

export interface AppState {
  projects: ProjectRecord[];
  threads: ThreadRecord[];
  selectedThreadId: string | null;
  error: string | null;
}

export class AppStore {
  private state: AppState = { projects: [], threads: [], selectedThreadId: null, error: null };
  private listeners = new Set<() => void>();

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    await this.guard(async () => {
      const [projects, threads] = await Promise.all([
        window.artex.invoke('projects:list') as Promise<ProjectRecord[]>,
        window.artex.invoke('threads:list') as Promise<ThreadRecord[]>,
      ]);
      this.set({ projects, threads });
    });
  }

  async addProject(): Promise<void> {
    await this.guard(async () => {
      const added = (await window.artex.invoke('projects:pick')) as ProjectRecord | null;
      if (added) await this.refresh();
    });
  }

  selectThread(id: string | null): void {
    this.set({ selectedThreadId: id });
  }

  async createThread(projectId: string, title: string): Promise<ThreadRecord> {
    const thread = (await window.artex.invoke('threads:create', { projectId, title })) as ThreadRecord;
    await this.refresh();
    this.set({ selectedThreadId: thread.id });
    return thread;
  }

  async setSessionId(threadId: string, sessionId: string): Promise<void> {
    await this.guard(async () => {
      await window.artex.invoke('threads:update', { id: threadId, sessionId });
      await this.refresh();
    });
  }

  clearError(): void {
    this.set({ error: null });
  }

  private async guard(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.set({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private set(change: Partial<AppState>): void {
    this.state = { ...this.state, ...change };
    for (const l of this.listeners) l();
  }
}
```

`apps/desktop/src/renderer/state/use-store.ts`:

```ts
import { useSyncExternalStore } from 'react';

export function useStore<T>(store: { subscribe(l: () => void): () => void }, read: () => T): T {
  return useSyncExternalStore((l) => store.subscribe(l), read, read);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run --project desktop-renderer`
Expected: PASS

- [ ] **Step 6: ACP 어댑터 구현**

이 파일은 실제 엔진과의 통신이라 단위 테스트 대신 Task 14 E2E로 검증한다.

`apps/desktop/src/renderer/acp/connection.ts`:

```ts
import { client, methods, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { createWebSocketStream } from '@agentclientprotocol/sdk/experimental/ws-client';
import { GooseExtClient } from '@aaif/goose-acp-client';
import type { AgentPort, PermissionRequestLike, PermissionResponseLike } from '@artex/core';

export interface EngineConnection extends AgentPort {
  goose: GooseExtClient;
  close(): void;
}

export interface EngineHandlers {
  onUpdate(notification: { sessionId: string; update: unknown }): void;
  onPermission(request: PermissionRequestLike): Promise<PermissionResponseLike>;
  onClose(): void;
}

const INITIALIZE_TIMEOUT_MS = 10_000;

export async function connectEngine(url: string, handlers: EngineHandlers): Promise<EngineConnection> {
  const stream = createWebSocketStream(url, { protocols: [] });
  const app = client({ name: 'artex' })
    .onRequest(methods.client.session.requestPermission, (ctx) =>
      handlers.onPermission(ctx.params as unknown as PermissionRequestLike) as never
    )
    .onNotification(methods.client.session.update, (ctx) =>
      handlers.onUpdate(ctx.params as unknown as { sessionId: string; update: unknown })
    );
  const connection = app.connect(stream);
  const agent = connection.agent;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('엔진 초기화 시간 초과')), INITIALIZE_TIMEOUT_MS)
  );
  await Promise.race([
    agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: 'artex', version: '0.1.0' },
    }),
    timeout,
  ]);
  void connection.closed.then(handlers.onClose, handlers.onClose);

  return {
    goose: new GooseExtClient(agent),
    close: () => connection.close(),
    async newSession(cwd) {
      const res = (await agent.request(methods.agent.session.new, { cwd, mcpServers: [] })) as {
        sessionId: string;
        configOptions?: unknown;
      };
      return { sessionId: String(res.sessionId), configOptions: res.configOptions };
    },
    async loadSession(sessionId, cwd) {
      const res = (await agent.request(methods.agent.session.load, { sessionId, cwd, mcpServers: [] })) as {
        configOptions?: unknown;
      };
      return { configOptions: res?.configOptions };
    },
    async prompt(sessionId, text) {
      const res = (await agent.request(methods.agent.session.prompt, {
        sessionId,
        prompt: [{ type: 'text', text }],
      })) as { stopReason: string };
      return { stopReason: res.stopReason };
    },
    async cancel(sessionId) {
      await agent.notify(methods.agent.session.cancel, { sessionId });
    },
    async setConfigOption(sessionId, configId, value) {
      const res = (await agent.request(methods.agent.session.setConfigOption, { sessionId, configId, value })) as {
        configOptions?: unknown;
      };
      return { configOptions: res?.configOptions };
    },
  };
}
```

- [ ] **Step 7: 타입 검사**

Run: `pnpm --filter @artex/desktop typecheck`
Expected: 오류 0. SDK 타입과 맞지 않는 곳이 있으면 `engine/ui/desktop/src/acp/acpConnection.ts`, `sessions.ts`, `prompt.ts`의 같은 호출과 비교해 맞춘다(형변환 추가가 아니라 실제 필드 이름을 맞춘다).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/renderer apps/desktop/test/unit
git commit -m "feat(desktop): ACP engine adapter and renderer app store"
```

---

### Task 12: Codex 레이아웃 UI 컴포넌트와 App 조립

**Files:**
- Create: `apps/desktop/src/renderer/components/Sidebar.tsx`, `ThreadView.tsx`, `Composer.tsx`, `ApprovalCard.tsx`, `ToolCallCard.tsx`, `StatusBadge.tsx`, `apps/desktop/src/renderer/runtime.ts`
- Modify: `apps/desktop/src/renderer/App.tsx` (전체 교체)
- Test: `apps/desktop/test/unit/components.test.tsx`

**Interfaces:**
- Consumes: `AppStore`, `useStore`, `connectEngine`, `SessionController`, `ThreadRuntime`, `TimelineItem`, `PermissionChoice`, `ConfigOptionView`, `COMPOSER_CONFIG_IDS`, `ThreadStatus`
- Produces:
  - `StatusBadge({ status }: { status: ThreadStatus })`
  - `ApprovalCard({ item, onChoose }: { item: Extract<TimelineItem, { kind: 'permission' }>; onChoose(choice: PermissionChoice): void })`
  - `ToolCallCard({ item }: { item: Extract<TimelineItem, { kind: 'tool' }> })`
  - `Composer({ running, configOptions, onSend, onCancel, onConfig }: { running: boolean; configOptions: ConfigOptionView[]; onSend(text: string): void; onCancel(): void; onConfig(id: string, value: string): void })`
  - `ThreadView({ title, runtime, onChoose }: { title: string; runtime: ThreadRuntime; onChoose(requestId: string, choice: PermissionChoice): void })`
  - `Sidebar({ projects, threads, statusOf, selectedId, onSelect, onNewThread, onAddProject, onOpenSettings })`
  - `runtime.ts`: 싱글턴 `appStore`, `controller`, `ensureThreadSession(thread: ThreadRecord): Promise<void>`, `bootEngine(): Promise<void>`, `getConnection(): EngineConnection | null`

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

`apps/desktop/test/unit/components.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalCard } from '../../src/renderer/components/ApprovalCard';
import { Composer } from '../../src/renderer/components/Composer';
import { StatusBadge } from '../../src/renderer/components/StatusBadge';
import { ThreadView } from '../../src/renderer/components/ThreadView';

const perm = {
  kind: 'permission' as const,
  id: 'permission-0',
  requestId: 'perm-1',
  title: 'git push',
  detail: 'git push -u origin fix',
  available: ['allow_once', 'reject'] as ('allow_once' | 'allow_always' | 'reject')[],
  resolved: null,
};

describe('ApprovalCard', () => {
  it('제공된 선택만 활성화, 클릭 시 onChoose', async () => {
    const onChoose = vi.fn();
    render(<ApprovalCard item={perm} onChoose={onChoose} />);
    expect(screen.getByRole('button', { name: '이 세션 동안 허용' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(onChoose).toHaveBeenCalledWith('allow_once');
    expect(screen.getByText('git push -u origin fix')).toBeInTheDocument();
  });

  it('해결된 카드는 버튼 대신 결과 표시', () => {
    render(<ApprovalCard item={{ ...perm, resolved: 'cancelled' }} onChoose={() => {}} />);
    expect(screen.queryByRole('button', { name: '승인' })).toBeNull();
    expect(screen.getByText('중단됨')).toBeInTheDocument();
  });
});

describe('Composer', () => {
  const base = { running: false, configOptions: [], onCancel: () => {}, onConfig: () => {} };

  it('Enter 전송, 공백만 있으면 전송 안 함', async () => {
    const onSend = vi.fn();
    render(<Composer {...base} onSend={onSend} />);
    const box = screen.getByLabelText('지시 입력');
    await userEvent.type(box, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(box, '고쳐줘{Enter}');
    expect(onSend).toHaveBeenCalledWith('고쳐줘');
    expect(box).toHaveValue('');
  });

  it('Shift+Enter는 줄바꿈', async () => {
    const onSend = vi.fn();
    render(<Composer {...base} onSend={onSend} />);
    await userEvent.type(screen.getByLabelText('지시 입력'), 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('지시 입력')).toHaveValue('a\nb');
  });

  it('실행 중에는 중단 버튼', async () => {
    const onCancel = vi.fn();
    render(<Composer {...base} running onSend={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: '중단' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('설정 옵션은 model·thinking_effort·mode만 선택 상자로 표시', async () => {
    const onConfig = vi.fn();
    const opt = (id: string) => ({ id, name: id, currentValue: 'a', options: [{ value: 'a', name: 'A' }, { value: 'b', name: 'B' }] });
    render(
      <Composer {...base} onSend={() => {}} onConfig={onConfig} configOptions={[opt('provider'), opt('model'), opt('mode')]} />
    );
    expect(screen.queryByLabelText('provider')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('mode'), 'b');
    expect(onConfig).toHaveBeenCalledWith('mode', 'b');
  });
});

describe('StatusBadge', () => {
  it.each([
    ['running', '실행 중'],
    ['awaiting_approval', '승인 대기'],
    ['done', '완료'],
    ['error', '오류'],
  ] as const)('%s → %s', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
  it('idle은 표시하지 않음', () => {
    const { container } = render(<StatusBadge status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ThreadView', () => {
  it('항목 종류별로 렌더링', () => {
    render(
      <ThreadView
        title="토큰 수정"
        onChoose={() => {}}
        runtime={{
          status: 'running',
          configOptions: [],
          items: [
            { kind: 'user', id: 'user-0', text: '고쳐줘' },
            { kind: 'agent', id: 'agent-1', text: '원인 확인' },
            { kind: 'tool', id: 'tool-2', toolCallId: 't', title: 'npm test', toolKind: 'execute', status: 'completed', output: '14 passed', files: ['a.ts'] },
            { kind: 'error', id: 'error-3', message: '401' },
          ],
        }}
      />
    );
    expect(screen.getByRole('heading', { name: '토큰 수정' })).toBeInTheDocument();
    expect(screen.getByText('고쳐줘')).toBeInTheDocument();
    expect(screen.getByText('원인 확인')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('401');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-renderer`
Expected: FAIL, 컴포넌트 모듈 없음

- [ ] **Step 3: StatusBadge·ApprovalCard·ToolCallCard 구현**

`apps/desktop/src/renderer/components/StatusBadge.tsx`:

```tsx
import type { ThreadStatus } from '@artex/core';

const LABEL: Record<Exclude<ThreadStatus, 'idle'>, string> = {
  running: '실행 중',
  awaiting_approval: '승인 대기',
  done: '완료',
  error: '오류',
};

export function StatusBadge({ status }: { status: ThreadStatus }) {
  if (status === 'idle') return null;
  const tone =
    status === 'awaiting_approval'
      ? 'bg-[var(--artex-warn-soft)] text-[var(--artex-warn-text)]'
      : status === 'error'
        ? 'bg-[var(--artex-del-bg)] text-[var(--artex-del-text)]'
        : 'bg-[var(--artex-fill)] text-[var(--artex-muted)]';
  return <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${tone}`}>{LABEL[status]}</span>;
}
```

`apps/desktop/src/renderer/components/ApprovalCard.tsx`:

```tsx
import type { PermissionChoice, TimelineItem } from '@artex/core';

const BUTTONS: { choice: PermissionChoice; label: string; primary: boolean }[] = [
  { choice: 'reject', label: '거부', primary: false },
  { choice: 'allow_always', label: '이 세션 동안 허용', primary: false },
  { choice: 'allow_once', label: '승인', primary: true },
];

const RESOLVED: Record<PermissionChoice | 'cancelled', string> = {
  allow_once: '승인됨',
  allow_always: '이 세션 동안 허용됨',
  reject: '거부됨',
  cancelled: '중단됨',
};

export function ApprovalCard({
  item,
  onChoose,
}: {
  item: Extract<TimelineItem, { kind: 'permission' }>;
  onChoose(choice: PermissionChoice): void;
}) {
  return (
    <div role="group" aria-label="승인 요청" className="flex flex-col items-center gap-3 rounded-[22px] bg-[var(--artex-pane)] p-5 text-center shadow-[var(--artex-shadow)]">
      <span className="text-base font-bold">{item.title}</span>
      {item.detail && (
        <code className="rounded-xl bg-[var(--artex-card)] px-3.5 py-2 font-[family-name:var(--artex-mono)] text-[13px]">{item.detail}</code>
      )}
      {item.resolved ? (
        <span className="text-[13px] text-[var(--artex-muted)]">{RESOLVED[item.resolved]}</span>
      ) : (
        <div className="flex w-full flex-wrap justify-center gap-2">
          {BUTTONS.map((b) => (
            <button
              key={b.choice}
              type="button"
              disabled={!item.available.includes(b.choice)}
              onClick={() => onChoose(b.choice)}
              className={`min-h-11 flex-1 basis-32 rounded-full text-sm disabled:opacity-40 ${
                b.primary ? 'bg-[var(--artex-accent)] font-semibold text-white' : 'bg-[var(--artex-fill)]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

`apps/desktop/src/renderer/components/ToolCallCard.tsx`:

```tsx
import type { TimelineItem } from '@artex/core';

const STATUS: Record<string, string> = { pending: '대기', in_progress: '실행 중', completed: '완료', failed: '실패' };

export function ToolCallCard({ item }: { item: Extract<TimelineItem, { kind: 'tool' }> }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-[var(--artex-card)]">
      <div className="flex min-h-11 items-center gap-2.5 px-4">
        <span className="font-[family-name:var(--artex-mono)] text-[13px]">{item.title}</span>
        <span className="ml-auto rounded-full bg-[var(--artex-fill)] px-2.5 py-0.5 text-xs font-semibold">{STATUS[item.status] ?? item.status}</span>
      </div>
      {item.output && (
        <pre className="m-0 px-4 pb-3.5 font-[family-name:var(--artex-mono)] text-[12.5px] whitespace-pre-wrap text-[var(--artex-muted)]">{item.output}</pre>
      )}
      {item.files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3.5">
          {item.files.map((f) => (
            <span key={f} className="rounded-full bg-[var(--artex-fill)] px-3 py-1.5 font-[family-name:var(--artex-mono)] text-xs">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Composer·ThreadView·Sidebar 구현**

`apps/desktop/src/renderer/components/Composer.tsx`:

```tsx
import { useState, type KeyboardEvent } from 'react';
import { COMPOSER_CONFIG_IDS, type ConfigOptionView } from '@artex/core';

export function Composer({
  running,
  configOptions,
  onSend,
  onCancel,
  onConfig,
}: {
  running: boolean;
  configOptions: ConfigOptionView[];
  onSend(text: string): void;
  onCancel(): void;
  onConfig(id: string, value: string): void;
}) {
  const [text, setText] = useState('');
  const visible = configOptions.filter((o) => (COMPOSER_CONFIG_IDS as readonly string[]).includes(o.id));

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-[28px] bg-[var(--artex-pane)] py-3.5 pr-3.5 pl-[18px] shadow-[var(--artex-shadow)]">
      <textarea
        aria-label="지시 입력"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="후속 지시 입력"
        className="w-full resize-none bg-transparent text-[15px] outline-none"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((o) => (
          <label key={o.id} className="contents">
            <span className="sr-only">{o.id}</span>
            <select
              aria-label={o.id}
              value={o.currentValue}
              onChange={(e) => onConfig(o.id, e.target.value)}
              className="min-h-9 rounded-full bg-[var(--artex-fill)] px-3.5 text-[13px]"
            >
              {o.options.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        {running ? (
          <button type="button" onClick={onCancel} className="ml-auto min-h-10 rounded-full bg-[var(--artex-fill)] px-4 text-sm font-semibold">
            중단
          </button>
        ) : (
          <button type="button" aria-label="보내기" onClick={submit} className="ml-auto size-10 rounded-full bg-[var(--artex-accent)] text-white">
            ↑
          </button>
        )}
      </div>
    </div>
  );
}
```

`apps/desktop/src/renderer/components/ThreadView.tsx`:

```tsx
import type { PermissionChoice, ThreadRuntime } from '@artex/core';
import { ApprovalCard } from './ApprovalCard';
import { ToolCallCard } from './ToolCallCard';

export function ThreadView({
  title,
  runtime,
  onChoose,
}: {
  title: string;
  runtime: ThreadRuntime;
  onChoose(requestId: string, choice: PermissionChoice): void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
      {runtime.items.map((item) => {
        switch (item.kind) {
          case 'user':
            return (
              <div key={item.id} className="max-w-[76%] self-end rounded-[22px_22px_6px_22px] bg-[var(--artex-accent)] px-4 py-2.5 whitespace-pre-wrap text-white">
                {item.text}
              </div>
            );
          case 'agent':
            return (
              <p key={item.id} className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">
                {item.text}
              </p>
            );
          case 'thought':
            return (
              <details key={item.id} className="text-[13px] text-[var(--artex-muted)]">
                <summary>사고 과정</summary>
                <p className="whitespace-pre-wrap">{item.text}</p>
              </details>
            );
          case 'tool':
            return <ToolCallCard key={item.id} item={item} />;
          case 'plan':
            return (
              <ol key={item.id} className="m-0 rounded-[18px] bg-[var(--artex-card)] py-3 pr-4 pl-8 text-[13.5px]">
                {item.entries.map((e, i) => (
                  <li key={i} className={e.status === 'completed' ? 'text-[var(--artex-muted)] line-through' : ''}>
                    {e.content}
                  </li>
                ))}
              </ol>
            );
          case 'permission':
            return <ApprovalCard key={item.id} item={item} onChoose={(c) => onChoose(item.requestId, c)} />;
          case 'error':
            return (
              <div key={item.id} role="alert" className="rounded-[18px] bg-[var(--artex-del-bg)] px-4 py-3 text-[var(--artex-del-text)]">
                {item.message}
              </div>
            );
        }
      })}
    </div>
  );
}
```

`apps/desktop/src/renderer/components/Sidebar.tsx`:

```tsx
import type { ProjectRecord, ThreadRecord, ThreadStatus } from '@artex/core';
import { StatusBadge } from './StatusBadge';

export function Sidebar({
  projects,
  threads,
  statusOf,
  selectedId,
  onSelect,
  onNewThread,
  onAddProject,
  onOpenSettings,
}: {
  projects: ProjectRecord[];
  threads: ThreadRecord[];
  statusOf(threadId: string): ThreadStatus;
  selectedId: string | null;
  onSelect(id: string): void;
  onNewThread(projectId: string): void;
  onAddProject(): void;
  onOpenSettings(): void;
}) {
  return (
    <nav aria-label="프로젝트와 스레드" className="flex w-[260px] shrink-0 flex-col gap-3.5 rounded-[24px] bg-[var(--artex-pane)] px-3 pt-[18px] pb-3 shadow-[var(--artex-shadow)]">
      <div className="flex items-center gap-2.5 px-1.5">
        <div aria-hidden className="flex size-8 items-center justify-center rounded-[10px] bg-[var(--artex-accent)] font-bold text-white">A</div>
        <span className="text-[17px] font-bold">ARTEX</span>
      </div>
      <button type="button" onClick={onAddProject} className="min-h-11 rounded-xl bg-[var(--artex-fill)] px-2.5 text-left font-semibold">
        프로젝트 추가
      </button>
      {projects.map((p) => (
        <section key={p.id} className="flex flex-col gap-1.5">
          <div className="flex items-center px-2.5">
            <span className="text-[13px] font-semibold text-[var(--artex-muted)]">{p.name}</span>
            <button type="button" aria-label={`${p.name} 새 스레드`} onClick={() => onNewThread(p.id)} className="ml-auto size-11 rounded-full">
              +
            </button>
          </div>
          <ul className="m-0 flex list-none flex-col rounded-2xl bg-[var(--artex-card)] p-1">
            {threads
              .filter((t) => t.projectId === p.id)
              .map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-current={t.id === selectedId ? 'true' : undefined}
                    onClick={() => onSelect(t.id)}
                    className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left ${
                      t.id === selectedId ? 'bg-[var(--artex-accent)] text-white' : ''
                    }`}
                  >
                    <span className="min-w-0 truncate">{t.title}</span>
                    <span className="ml-auto">
                      <StatusBadge status={statusOf(t.id)} />
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <button type="button" onClick={onOpenSettings} className="mt-auto min-h-11 rounded-full bg-[var(--artex-fill)] px-4">
        설정
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run --project desktop-renderer`
Expected: PASS

- [ ] **Step 6: 런타임 조립과 App 교체**

`apps/desktop/src/renderer/runtime.ts`:

```ts
import { SessionController, type ThreadRecord } from '@artex/core';
import { connectEngine, type EngineConnection } from './acp/connection';
import { AppStore } from './state/app-store';

export const appStore = new AppStore();
export const controller = new SessionController();

let connection: EngineConnection | null = null;
const attached = new Set<string>();

export function getConnection(): EngineConnection | null {
  return connection;
}

export async function bootEngine(): Promise<void> {
  const url = (await window.artex.invoke('engine:getAcpUrl')) as string | null;
  if (!url) return;
  connection?.close();
  attached.clear();
  connection = await connectEngine(url, {
    onUpdate: (n) => controller.handleUpdate(n),
    onPermission: (r) => controller.handlePermission(r),
    onClose: () => {
      connection = null;
      attached.clear();
      controller.markEngineLost('엔진 연결 끊김');
    },
  });
  controller.setPort(connection);
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
```

`apps/desktop/src/renderer/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { EngineStatusView } from '../shared/artex-api';
import { Composer } from './components/Composer';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { ThreadView } from './components/ThreadView';
import { appStore, bootEngine, controller, ensureThreadSession } from './runtime';
import { useStore } from './state/use-store';

export function App() {
  const state = useStore(appStore, () => appStore.getState());
  useStore(controller, () => controller.getVersion());
  const [engine, setEngine] = useState<EngineStatusView>({ state: 'starting' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  useEffect(() => {
    void appStore.refresh();
    void window.artex.invoke('engine:getStatus').then((s) => setEngine(s as EngineStatusView));
    return window.artex.onEngineStatus(setEngine);
  }, []);

  useEffect(() => {
    if (engine.state === 'ready') void bootEngine().catch((e) => setThreadError(String(e)));
  }, [engine.state]);

  const selected = state.threads.find((t) => t.id === state.selectedThreadId) ?? null;

  useEffect(() => {
    if (selected && engine.state === 'ready') {
      setThreadError(null);
      void ensureThreadSession(selected).catch((e) => setThreadError(e instanceof Error ? e.message : String(e)));
    }
  }, [selected?.id, engine.state]);

  const statusOf = (id: string) => controller.getThread(id).status;
  const runtime = controller.getThread(selected?.id ?? '');
  const running = runtime.status === 'running' || runtime.status === 'awaiting_approval';

  return (
    <div className="flex h-full gap-2.5 p-2.5">
      <Sidebar
        projects={state.projects}
        threads={state.threads}
        statusOf={statusOf}
        selectedId={state.selectedThreadId}
        onSelect={(id) => appStore.selectThread(id)}
        onNewThread={(projectId) => void appStore.createThread(projectId, '새 스레드')}
        onAddProject={() => void appStore.addProject()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] bg-[var(--artex-pane)] shadow-[var(--artex-shadow)]">
        {engine.state !== 'ready' && (
          <div role="status" className="bg-[var(--artex-warn-soft)] px-7 py-2 text-[13px] text-[var(--artex-warn-text)]">
            엔진 {engine.state}
            {engine.message ? ` · ${engine.message}` : ''}
          </div>
        )}
        {(state.error || threadError) && (
          <div role="alert" className="bg-[var(--artex-del-bg)] px-7 py-2 text-[13px] text-[var(--artex-del-text)]">
            {state.error ?? threadError}
          </div>
        )}
        {settingsOpen ? (
          <Settings onClose={() => setSettingsOpen(false)} />
        ) : selected ? (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-6">
              <div className="mx-auto max-w-[800px]">
                <ThreadView title={selected.title} runtime={runtime} onChoose={(rid, c) => controller.respond(selected.id, rid, c)} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-[800px] px-7 pb-5">
              <Composer
                running={running}
                configOptions={runtime.configOptions}
                onSend={(text) => void controller.send(selected.id, text)}
                onCancel={() => void controller.cancel(selected.id)}
                onConfig={(id, value) => void controller.setConfig(selected.id, id, value)}
              />
            </div>
          </>
        ) : (
          <div className="m-auto text-[var(--artex-muted)]">프로젝트 추가 후 새 스레드 시작</div>
        )}
      </main>
    </div>
  );
}
```

Task 13 전까지 `Settings`가 없으므로 임시 파일을 만든다. `apps/desktop/src/renderer/components/Settings.tsx`:

```tsx
export function Settings({ onClose }: { onClose(): void }) {
  return (
    <div className="p-7">
      <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-[var(--artex-fill)] px-4">
        닫기
      </button>
    </div>
  );
}
```

- [ ] **Step 7: 타입 검사와 전체 단위 테스트**

Run: `pnpm typecheck && pnpm test`
Expected: 오류 0, 전체 PASS

- [ ] **Step 8: 셸 스모크 갱신**

`apps/desktop/test/e2e/shell.spec.ts`의 기대값을 새 App 기준으로 바꾼다:

```ts
  await expect(win.getByText('프로젝트 추가 후 새 스레드 시작')).toBeVisible({ timeout: 30_000 });
  await expect(win.getByRole('status')).toHaveCount(0, { timeout: 30_000 });
```

위 두 줄로 `engine-status` 테스트 ID 검사를 대체한다. 가짜 엔진은 `/acp` WebSocket을 제공하지 않으므로 `bootEngine`이 실패해 상단에 오류가 보일 수 있다. 이 스모크는 창·보안 설정·엔진 ready 표시까지만 확인한다.

Run: `cd apps/desktop && pnpm exec electron-forge package && pnpm e2e -- shell.spec.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): Codex-style layout with thread view, composer, approval card"
```

---

### Task 13: 프로바이더 설정 화면

**Files:**
- Modify: `apps/desktop/src/renderer/components/Settings.tsx` (전체 교체)
- Create: `apps/desktop/src/renderer/settings/provider-form.ts`
- Test: `apps/desktop/test/unit/provider-form.test.ts`, `apps/desktop/test/unit/settings.test.tsx`

**Interfaces:**
- Consumes: `getConnection()` (Task 12) → `goose.providersList_unstable({})`, `goose.providersConfigSave_unstable({ providerId, fields })`, `goose.defaultsRead_unstable({})`, `goose.defaultsSave_unstable({ providerId, modelId })`
- Produces:
  - `interface ProviderEntryView { providerId: string; providerName: string; configured: boolean; defaultModel: string; configKeys: { name: string; required: boolean; secret: boolean; default?: string | null }[]; models: { id: string; name: string }[] }`
  - `visibleProviders(entries: unknown[]): ProviderEntryView[]` (`visibleInSetup && !deprecated`, 이름순)
  - `buildConfigFields(keys: ProviderEntryView['configKeys'], values: Record<string, string>): { fields: { key: string; value: string }[]; missing: string[] }`
  - `Settings({ onClose, api? })` — `api` 기본값은 `getConnection()?.goose`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/desktop/test/unit/provider-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildConfigFields, visibleProviders } from '../../src/renderer/settings/provider-form';

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  providerId: id,
  providerName: id.toUpperCase(),
  configured: false,
  defaultModel: 'm1',
  visibleInSetup: true,
  deprecated: false,
  configKeys: [],
  models: [{ id: 'm1', name: 'M1' }],
  ...extra,
});

describe('visibleProviders', () => {
  it('숨김·폐기 제외, 이름순', () => {
    const out = visibleProviders([entry('openai'), entry('anthropic'), entry('old', { deprecated: true }), entry('hid', { visibleInSetup: false })]);
    expect(out.map((p) => p.providerId)).toEqual(['anthropic', 'openai']);
  });
});

describe('buildConfigFields', () => {
  const keys = [
    { name: 'OPENAI_API_KEY', required: true, secret: true },
    { name: 'OPENAI_HOST', required: false, secret: false, default: 'https://api.openai.com' },
  ];
  it('입력된 값만 전송, 필수 누락 보고', () => {
    expect(buildConfigFields(keys, { OPENAI_HOST: 'http://gw' })).toEqual({
      fields: [{ key: 'OPENAI_HOST', value: 'http://gw' }],
      missing: ['OPENAI_API_KEY'],
    });
  });
  it('공백 값은 미입력 취급', () => {
    expect(buildConfigFields(keys, { OPENAI_API_KEY: '  ' }).missing).toEqual(['OPENAI_API_KEY']);
  });
});
```

`apps/desktop/test/unit/settings.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '../../src/renderer/components/Settings';

function fakeApi() {
  return {
    providersList_unstable: vi.fn(async () => ({
      entries: [
        {
          providerId: 'openai',
          providerName: 'OpenAI',
          configured: false,
          defaultModel: 'gpt-x',
          visibleInSetup: true,
          deprecated: false,
          configKeys: [{ name: 'OPENAI_API_KEY', required: true, secret: true }],
          models: [{ id: 'gpt-x', name: 'GPT X' }],
        },
      ],
    })),
    providersConfigSave_unstable: vi.fn(async () => ({})),
    defaultsRead_unstable: vi.fn(async () => ({ providerId: null, modelId: null })),
    defaultsSave_unstable: vi.fn(async () => ({})),
  };
}

describe('Settings', () => {
  it('비밀 키는 password 입력, 저장 시 설정·기본값 저장', async () => {
    const api = fakeApi();
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenAI' }));
    const key = screen.getByLabelText('OPENAI_API_KEY');
    expect(key).toHaveAttribute('type', 'password');
    await userEvent.type(key, 'sk-test');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(api.providersConfigSave_unstable).toHaveBeenCalledWith({
      providerId: 'openai',
      fields: [{ key: 'OPENAI_API_KEY', value: 'sk-test' }],
    });
    expect(api.defaultsSave_unstable).toHaveBeenCalledWith({ providerId: 'openai', modelId: 'gpt-x' });
    expect(await screen.findByText('저장 완료')).toBeInTheDocument();
  });

  it('필수 값 누락 시 저장하지 않고 안내', async () => {
    const api = fakeApi();
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenAI' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(api.providersConfigSave_unstable).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('필수 입력 누락: OPENAI_API_KEY');
  });

  it('엔진 미연결이면 안내만 표시', () => {
    render(<Settings onClose={() => {}} api={null} />);
    expect(screen.getByText('엔진 연결 후 설정 가능')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run --project desktop-main --project desktop-renderer`
Expected: FAIL, `provider-form` 없음 및 Settings 동작 불일치

- [ ] **Step 3: provider-form 구현**

`apps/desktop/src/renderer/settings/provider-form.ts`:

```ts
export interface ProviderEntryView {
  providerId: string;
  providerName: string;
  configured: boolean;
  defaultModel: string;
  configKeys: { name: string; required: boolean; secret: boolean; default?: string | null }[];
  models: { id: string; name: string }[];
}

export function visibleProviders(entries: unknown[]): ProviderEntryView[] {
  return (entries as (ProviderEntryView & { visibleInSetup: boolean; deprecated: boolean })[])
    .filter((e) => e.visibleInSetup && !e.deprecated)
    .map(({ providerId, providerName, configured, defaultModel, configKeys, models }) => ({
      providerId,
      providerName,
      configured,
      defaultModel,
      configKeys,
      models,
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}

export function buildConfigFields(keys: ProviderEntryView['configKeys'], values: Record<string, string>) {
  const fields: { key: string; value: string }[] = [];
  const missing: string[] = [];
  for (const k of keys) {
    const value = (values[k.name] ?? '').trim();
    if (value) fields.push({ key: k.name, value });
    else if (k.required) missing.push(k.name);
  }
  return { fields, missing };
}
```

- [ ] **Step 4: Settings 구현 (임시 파일 전체 교체)**

`apps/desktop/src/renderer/components/Settings.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getConnection } from '../runtime';
import { buildConfigFields, visibleProviders, type ProviderEntryView } from '../settings/provider-form';

type ProviderApi = {
  providersList_unstable(p: object): Promise<{ entries: unknown[] }>;
  providersConfigSave_unstable(p: { providerId: string; fields: { key: string; value: string }[] }): Promise<unknown>;
  defaultsRead_unstable(p: object): Promise<{ providerId?: string | null; modelId?: string | null }>;
  defaultsSave_unstable(p: { providerId: string; modelId?: string | null }): Promise<unknown>;
};

export function Settings({ onClose, api }: { onClose(): void; api?: ProviderApi | null }) {
  const client = api === undefined ? ((getConnection()?.goose as unknown as ProviderApi) ?? null) : api;
  const [providers, setProviders] = useState<ProviderEntryView[]>([]);
  const [selected, setSelected] = useState<ProviderEntryView | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [model, setModel] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!client) return;
    void client
      .providersList_unstable({})
      .then((r) => setProviders(visibleProviders(r.entries)))
      .catch((e) => setMessage({ tone: 'error', text: String(e) }));
  }, [client]);

  if (!client) return <div className="p-7 text-[var(--artex-muted)]">엔진 연결 후 설정 가능</div>;

  const choose = (p: ProviderEntryView) => {
    setSelected(p);
    setValues({});
    setModel(p.defaultModel);
    setMessage(null);
  };

  const save = async () => {
    if (!selected) return;
    const { fields, missing } = buildConfigFields(selected.configKeys, values);
    if (missing.length) {
      setMessage({ tone: 'error', text: `필수 입력 누락: ${missing.join(', ')}` });
      return;
    }
    try {
      if (fields.length) await client.providersConfigSave_unstable({ providerId: selected.providerId, fields });
      await client.defaultsSave_unstable({ providerId: selected.providerId, modelId: model || null });
      setMessage({ tone: 'ok', text: '저장 완료' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="flex items-center">
        <h1 className="m-0 text-[28px] font-bold">설정 · 모델 프로바이더</h1>
        <button type="button" onClick={onClose} className="ml-auto min-h-11 rounded-full bg-[var(--artex-fill)] px-4">
          닫기
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <button
            key={p.providerId}
            type="button"
            onClick={() => choose(p)}
            aria-pressed={selected?.providerId === p.providerId}
            className={`min-h-11 rounded-full px-4 ${selected?.providerId === p.providerId ? 'bg-[var(--artex-accent)] text-white' : 'bg-[var(--artex-fill)]'}`}
          >
            {p.providerName}
          </button>
        ))}
      </div>
      {selected && (
        <form
          className="flex max-w-[520px] flex-col gap-3 rounded-[18px] bg-[var(--artex-card)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {selected.configKeys.map((k) => (
            <label key={k.name} className="flex flex-col gap-1 text-[13px]">
              <span>
                {k.name}
                {k.required ? ' (필수)' : ''}
              </span>
              <input
                aria-label={k.name}
                type={k.secret ? 'password' : 'text'}
                placeholder={k.default ?? ''}
                value={values[k.name] ?? ''}
                onChange={(e) => setValues({ ...values, [k.name]: e.target.value })}
                className="min-h-11 rounded-[14px] bg-[var(--artex-pane)] px-3.5"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-[13px]">
            <span>기본 모델</span>
            <select aria-label="기본 모델" value={model} onChange={(e) => setModel(e.target.value)} className="min-h-11 rounded-[14px] bg-[var(--artex-pane)] px-3.5">
              {selected.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-full bg-[var(--artex-accent)] font-semibold text-white">
            저장
          </button>
        </form>
      )}
      {message &&
        (message.tone === 'error' ? (
          <div role="alert" className="text-[var(--artex-del-text)]">
            {message.text}
          </div>
        ) : (
          <div role="status">{message.text}</div>
        ))}
    </div>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 전체 PASS, 오류 0

- [ ] **Step 6: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): provider settings screen"
```

---

### Task 14: 실제 엔진 E2E (가짜 OpenAI 서버)

**Files:**
- Create: `apps/desktop/test/e2e/fake-openai.ts`, `apps/desktop/test/e2e/thread-flow.spec.ts`

**Interfaces:**
- Consumes: 빌드된 앱(`.vite/build/main.js`), `apps/desktop/resources/bin/goose`(Task 1), 엔진 환경 변수 `GOOSE_PATH_ROOT`, `GOOSE_PROVIDER=openai`, `GOOSE_MODEL`, `OPENAI_API_KEY`, `OPENAI_HOST`, `OPENAI_BASE_PATH=v1/chat/completions`, `GOOSE_MODE=approve`, `GOOSE_DISABLE_KEYRING=1`
- Produces: `startFakeOpenAI(script: FakeTurn[]): Promise<{ url: string; requests: unknown[]; close(): Promise<void> }>`, `type FakeTurn = { text: string } | { toolCall: { name: string; arguments: Record<string, unknown> } }`

엔진 근거: `engine/crates/goose-providers/src/openai.rs`의 `OPENAI_HOST`·`OPENAI_BASE_PATH` 설정 키, 엔진 테스트 `engine/crates/goose/src/agents/state_machine/tests/agent_reply.rs:1019-1020`의 사용 예, LLM에 노출되는 셸 도구 이름 `developer__shell`(확장 키 + `__` + 도구 이름, `engine/crates/goose/src/agents/extension_manager/mod.rs:363`, 예시 `engine/crates/goose/src/agents/state_machine/ops_llm.rs:243`).

- [ ] **Step 1: 가짜 OpenAI 서버 작성**

`apps/desktop/test/e2e/fake-openai.ts`:

```ts
import http from 'node:http';

export type FakeTurn = { text: string } | { toolCall: { name: string; arguments: Record<string, unknown> } };

function sse(res: http.ServerResponse, chunks: object[]) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.end('data: [DONE]\n\n');
}

export async function startFakeOpenAI(script: FakeTurn[]) {
  const requests: unknown[] = [];
  let turn = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url?.includes('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'fake-model', object: 'model' }] }));
        return;
      }
      const parsed = body ? JSON.parse(body) : {};
      requests.push(parsed);
      const step = script[Math.min(turn++, script.length - 1)]!;
      const base = { id: `c${turn}`, object: 'chat.completion.chunk', created: 0, model: 'fake-model' };
      const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
      if ('text' in step) {
        const delta = { role: 'assistant', content: step.text };
        if (parsed.stream) {
          sse(res, [
            { ...base, choices: [{ index: 0, delta, finish_reason: null }] },
            { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
          ]);
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: delta, finish_reason: 'stop' }], usage }));
        }
        return;
      }
      const call = { index: 0, id: `call_${turn}`, type: 'function', function: { name: step.toolCall.name, arguments: JSON.stringify(step.toolCall.arguments) } };
      if (parsed.stream) {
        sse(res, [
          { ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] },
          { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
        ]);
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }], usage }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
```

- [ ] **Step 2: E2E 시나리오 작성**

`apps/desktop/test/e2e/thread-flow.spec.ts`:

```ts
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeOpenAI } from './fake-openai';

const appDir = path.resolve(__dirname, '../..');
const engineBin = path.join(appDir, 'resources', 'bin', process.platform === 'win32' ? 'goose.exe' : 'goose');

async function launch(llmUrl: string, project: string): Promise<ElectronApplication> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-flow-'));
  const app = await electron.launch({
    args: [path.join(appDir, '.vite/build/main.js')],
    env: {
      ...process.env,
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
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, project);
  return app;
}

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
```

- [ ] **Step 3: 엔진·앱 빌드 후 E2E 실행**

Run:

```bash
pnpm build:engine
cd apps/desktop && pnpm exec electron-forge package && pnpm e2e -- thread-flow.spec.ts
```

Linux에서는 마지막 명령을 `xvfb-run -a pnpm e2e -- thread-flow.spec.ts`로 실행한다.

Expected: PASS 2 tests.

실패 시 점검 순서:
1. 가짜 서버 `requests`가 비어 있음 → 엔진이 프로바이더를 못 읽음. 콘솔 `[engine]` 로그에서 프로바이더 오류를 확인하고, `OPENAI_BASE_PATH` 형식을 `engine/crates/goose-providers/src/openai.rs`의 기본값과 비교한다.
2. 승인 카드 미표시 → `GOOSE_MODE=approve`가 적용됐는지 확인한다. 세션 configOptions `mode`의 currentValue를 로그로 출력한다.
3. 사용자 말풍선 2개 → 엔진이 live 중에도 `user_message_chunk`를 다시 보내는 경우다. `SessionController.send`에 "직전 send 텍스트와 같은 user 조각 1회 무시" 규칙과 그 단위 테스트를 추가한다.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/test/e2e
git commit -m "test(desktop): end-to-end local thread flow against real engine"
```

---

### Task 15: 패키징과 CI (Windows·macOS)

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `pnpm test`, `pnpm typecheck`, `pnpm build:engine`, `electron-forge make`, E2E 스펙
- Produces: CI 산출물 `ARTEX-Setup.exe`(Windows), macOS zip

- [ ] **Step 1: CI 워크플로 작성**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm test:scripts

  build:
    needs: unit
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: engine }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build:engine
      - run: pnpm exec electron-forge package
        working-directory: apps/desktop
      - run: pnpm e2e
        working-directory: apps/desktop
      - run: pnpm exec electron-forge make
        working-directory: apps/desktop
      - uses: actions/upload-artifact@v4
        with:
          name: artex-${{ matrix.os }}
          path: apps/desktop/out/make/**
```

Rust 툴체인은 `engine/rust-toolchain.toml`을 cargo가 자동으로 읽는다. 러너에 rustup이 기본 설치돼 있다.

- [ ] **Step 2: README 갱신**

`README.md`:

````markdown
# ARTEX

Goose 엔진 기반 사내 데스크톱 코딩 에이전트 IDE.

- 설계: `docs/superpowers/specs/2026-11-05-artex-ide-design.md`
- 1단계 계획: `docs/superpowers/plans/2026-11-05-artex-phase1-skeleton.md`
- 라이선스 고지: `NOTICE`, 엔진 수정 지점: `docs/engine-patches.md`

## 개발

```bash
pnpm install
pnpm build:engine          # Rust 필요
pnpm test
cd apps/desktop && pnpm start
```

## 설치 파일

```bash
cd apps/desktop && pnpm exec electron-forge make
```

Windows: `apps/desktop/out/make/squirrel.windows/x64/ARTEX-Setup.exe`
````

- [ ] **Step 3: 로컬 Windows 빌드 확인 (Windows PC에서)**

Run:

```bash
pnpm install
pnpm build:engine
cd apps/desktop
pnpm exec electron-forge make
```

Expected: `apps/desktop/out/make/squirrel.windows/x64/ARTEX-Setup.exe` 생성. 설치 후 실행 → 설정에서 프로바이더 저장 → 프로젝트 추가 → 새 스레드 → 지시 → 응답 확인 (스펙 12장 1단계 완료 기준).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: windows/macos build, e2e and installer artifacts"
```

---

## 스펙 대비 범위 확인

| 스펙 항목 | 담당 Task |
|---|---|
| 엔진 포크(subtree), NOTICE, 수정 지점 기록 | 1 |
| 라이트·다크 토큰, 대비 4.5:1 | 2 |
| 스레드 레코드·상태(실행 중·승인 대기·완료·오류) | 3, 6, 12 |
| `session/update` → 화면 요소 변환 | 4 |
| 승인 카드(승인·이 세션 동안 허용·거부) | 5, 6, 12 |
| 모델·추론 강도·승인 모드 선택 | 5, 12 |
| `goose serve` 실행·127.0.0.1·비밀키·텔레메트리 차단·재시작 3회 | 7 |
| 로컬 기록 저장 | 8 (스펙 7.2의 SQLite 대신 JSON 파일. 1단계 데이터 규모에서 네이티브 모듈 빌드 부담 회피, 2단계에서 재검토) |
| IPC 허용 목록·zod 검증, renderer 보안 설정 | 9, 10 |
| Local 스레드 생성·지시·스트리밍·중단 | 6, 11, 12, 14 |
| 다중 프로바이더 설정 화면 | 13 |
| Windows 설치 파일, CI(Windows·macOS) | 15 |
| E2E: Local 스레드 완주 | 14 |
| 시각 회귀(스크린샷) | 미포함. 1단계 화면이 안정된 뒤 2단계 첫 Task로 추가 |
| OS 알림(백그라운드 상태 변화) | 미포함. 스펙 7.5는 2단계 병렬 스레드 범위 |
