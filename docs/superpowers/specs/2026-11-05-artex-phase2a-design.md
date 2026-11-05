# ARTEX 2a단계 설계 스펙 — Worktree · Review 패널 · 터미널 · 병렬 알림

- 작성일: 2026-11-05
- 상태: 검토 대기
- 상위 스펙: `docs/superpowers/specs/2026-11-05-artex-ide-design.md` (12장 2단계의 앱 쪽 범위)
- 선행: 1단계 골격 MVP (`docs/superpowers/plans/2026-11-05-artex-phase1-skeleton.md`) 완료 상태
- 분리: OS 샌드박스는 2b단계 별도 스펙

---

## 1. 목표

- Codex식 병렬 작업 흐름 완성: 격리된 Worktree 스레드에서 에이전트 작업 → diff 검토 → 줄 코멘트로 재작업 → 커밋·push → 내 브랜치로 가져오기
- 스레드별 통합 터미널
- 여러 스레드 동시 진행 시 상태 변화 OS 알림

## 2. 확정된 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 범위 분할 | 2a(앱 쪽) / 2b(OS 샌드박스) | 사용자 선택. 샌드박스는 Rust 엔진 수정 + Windows 기술 검증 필요 |
| Worktree 결과 반영 | 커밋 + push, 선택적 "내 브랜치로 가져오기"(로컬 merge) | 사용자 선택 |
| git 실행 방식 | main 프로세스에서 시스템 git CLI `execFile` | 사용자 git 인증·hook·설정 재사용, worktree 완전 지원 |
| diff 표현 | `git diff` unified 출력 자체 파싱 | 작은 순수 함수, 단위 테스트 용이 |
| 터미널 | node-pty + xterm.js, 스레드별 1개, 스레드 `cwd` | VS Code와 같은 구성. 사용자 전용(에이전트는 출력 미참조) |
| stage 단위 | 파일 단위 | hunk 단위는 후속 단계 |
| OS 알림 | 창 비활성일 때 승인 대기·완료·오류 전환 시 | 1단계 스펙 7.5 |

## 3. 비목표

- PR 생성·PR 피드백 반영 (3단계)
- hunk·줄 단위 stage
- OS 수준 샌드박스 (2b)
- 터미널 출력을 에이전트에게 전달
- 원격 저장소 생성·인증 설정 UI (사용자의 기존 git 인증 사용)
- 강제 push, rebase, 히스토리 재작성

## 4. 구성요소

```
packages/git/                    순수 로직 + git CLI 래퍼 (Node 전용, main에서만 사용)
├─ src/diff-parse.ts             unified diff → DiffFile[] (hunk·줄·번호)
├─ src/status-parse.ts           git status --porcelain=v2 -z → StatusEntry[]
├─ src/slug.ts                   제목 → 브랜치 이름 artex/<slug>-<4자 해시>
├─ src/path-guard.ts             스레드 cwd 밖 경로 거부
├─ src/git-runner.ts             execFile 래퍼: 시간 제한, 오류 분류, 출력 마스킹
├─ src/worktree.ts               생성·정리·더티 확인·목록
├─ src/review.ts                 status·diff·stage·unstage·commit·push·로컬 병합
└─ test/                         단위 + 임시 저장소 통합 테스트
apps/desktop/src/main/
├─ terminal.ts                   node-pty 세션 관리 (스레드별, 크기 조정, 종료)
├─ notifier.ts                   OS 알림 (창 비활성 판정, 클릭 시 스레드 선택)
└─ ipc.ts 확장                   git:* · worktree:* · terminal:* 채널 (zod 검증)
apps/desktop/src/renderer/components/
├─ NewThreadDialog.tsx           Local/Worktree 선택, 기준 브랜치 표시
├─ ReviewPanel.tsx               세그먼트 탭(변경 사항 · 터미널)
├─ FileList.tsx                  원형 체크 stage, +/− 수치
├─ DiffView.tsx                  hunk·줄 표시, 줄 클릭 코멘트
├─ CommitBar.tsx                 커밋 메시지, 커밋 · push · 내 브랜치로 가져오기
└─ TerminalView.tsx              xterm.js
```

### 4.1 데이터 모델 변경

`ThreadRecord`(packages/core/src/records.ts) 확장:

| 필드 | 타입 | 의미 |
|---|---|---|
| `baseBranch` | `string \| null` | Worktree 생성 기준 브랜치 (Local은 null) |

- 기존 필드 `branch`·`worktreePath` 사용 시작 (1단계는 항상 null)
- `threads.json` `version: 1` 유지. 새 필드 누락 레코드는 `baseBranch: null`로 읽음

### 4.2 IPC 채널 추가

| 채널 | 입력 | 출력 |
|---|---|---|
| `worktree:create` | `{ projectId, title }` | `ThreadRecord` |
| `worktree:remove` | `{ threadId, force: boolean }` | `void` |
| `git:capabilities` | `{ projectId }` | `{ gitInstalled, isRepo, hasCommits, hasRemote, currentBranch }` |
| `git:status` | `{ threadId }` | `StatusEntry[]` |
| `git:diff` | `{ threadId, staged: boolean }` | `DiffFile[]` |
| `git:stage` / `git:unstage` | `{ threadId, paths: string[] }` | `void` |
| `git:commit` | `{ threadId, message }` | `{ sha }` |
| `git:push` | `{ threadId }` | `{ remoteBranch }` |
| `git:mergeIntoLocal` | `{ threadId }` | `{ merged: true } \| { merged: false, reason, conflicts?: string[] }` |
| `terminal:open` | `{ threadId, cols, rows }` | `{ terminalId }` |
| `terminal:write` | `{ terminalId, data }` | `void` |
| `terminal:resize` | `{ terminalId, cols, rows }` | `void` |
| `terminal:close` | `{ terminalId }` | `void` |
| 이벤트 `terminal:data` | main → renderer `{ terminalId, data }` | |
| 이벤트 `terminal:exit` | main → renderer `{ terminalId, code }` | |
| 이벤트 `notify:select` | main → renderer `{ threadId }` | |

- 모든 입력 zod `strictObject`. `threadId`로 main이 ThreadStore에서 `cwd`를 조회 — 화면은 경로를 직접 보내지 않음
- `paths`는 `path-guard`로 `cwd` 내부만 허용

## 5. 데이터 흐름

### 5.1 Worktree 스레드 생성

1. 새 스레드 대화상자에서 `git:capabilities` 조회. 조건 미충족 시 Worktree 선택지 비활성 + 사유 표시
2. `worktree:create` → main:
   - 기준 브랜치 = 원래 폴더의 현재 브랜치 (detached HEAD면 커밋 SHA)
   - 브랜치 이름 = `artex/<slug>-<4자>`
   - `git worktree add <userData>/worktrees/<threadId> -b <branch> <base>`
   - ThreadRecord 저장: `kind:'worktree'`, `cwd = worktreePath`, `branch`, `baseBranch`
3. 화면: 1단계와 같은 `ensureThreadSession`으로 `session/new { cwd: worktreePath }`

### 5.2 Review 패널

- 표시 대상: 선택된 스레드의 `cwd` (Local은 프로젝트 폴더, Worktree는 worktree 폴더)
- 갱신 시점
  - 해당 스레드의 `tool_call_update`가 `completed`로 바뀔 때
  - 패널 열기·스레드 전환
  - main의 파일 감시 이벤트 (1초 묶음)
  - 사용자 새로고침
- 파일 목록: `git:status` → 원형 체크(staged 여부), 파일명·폴더·+/− 수치
- diff: `git:diff`(staged=false와 true 병합 표시) → hunk 단위, 줄 번호, 추가·삭제 색 + `+`/`−` 기호
- stage·unstage: 체크 토글 → `git:stage`/`git:unstage` → 갱신

### 5.3 줄 코멘트 → 재작업

1. diff 줄 클릭 → 코멘트 입력 → 대기 목록에 추가 (화면 상태, 저장 안 함)
2. "코멘트로 재작업" → 대기 코멘트를 아래 형식으로 묶어 `controller.send`
3. 전송 후 대기 목록 비움

```
아래 코드 리뷰 코멘트 반영
- src/auth/refresh.ts:22 — inflight 초기화를 에러 경로에서도 테스트할 것
- src/auth/refresh.ts:25 — 변수명 명확화
```

### 5.4 커밋 · push · 내 브랜치로 가져오기

| 동작 | 처리 |
|---|---|
| 커밋 | staged 파일 1개 이상 + 메시지 필수 → `git commit -m <message>` |
| push | `hasRemote` 일 때만 활성 → `git push -u origin <branch>` (Local 스레드는 현재 브랜치) |
| 내 브랜치로 가져오기 | Worktree 스레드 전용. 아래 절차 |

내 브랜치로 가져오기 절차:
1. worktree에 미커밋 변경 있음 → 중단, "커밋 먼저" 안내
2. 원래 프로젝트 폴더 더티 → 중단, 더티 파일 목록 표시
3. 원래 폴더 현재 브랜치에서 `git merge --no-ff <branch> -m "Merge <branch>"`
4. 충돌 → `git merge --abort`, 충돌 파일 목록 반환
5. 성공 → 완료 표시

### 5.5 터미널

- 터미널 탭 처음 열 때 `terminal:open` → node-pty로 셸 시작
  - Windows: `powershell.exe` (없으면 `cmd.exe`)
  - macOS·Linux: `$SHELL` (없으면 `/bin/zsh` → `/bin/bash`)
  - `cwd` = 스레드 `cwd`, 환경 변수 = 앱 환경 (ARTEX 엔진 비밀키 등 제거)
- 출력 `terminal:data` 이벤트 → xterm.js. 입력 → `terminal:write`
- 스레드 전환: 터미널 유지 (화면만 숨김). 스레드 삭제·앱 종료: 종료
- 스레드당 1개. 출력 버퍼는 xterm.js 스크롤백(5,000줄)

### 5.6 병렬 상태 · OS 알림

- 사이드바 배지: 1단계 그대로
- 알림 조건: 스레드 상태가 `awaiting_approval` · `done` · `error`로 바뀌고 앱 창이 포커스 상태가 아님
- 판정은 renderer(`SessionController` 구독)에서 하고, 발송은 main `notifier`가 Electron `Notification`으로
- 알림 문구: `승인 대기 · <스레드 제목>`, `완료 · <스레드 제목>`, `오류 · <스레드 제목>`
- 알림 클릭 → 창 복원·포커스 → `notify:select` → 해당 스레드 선택
- 같은 스레드·같은 상태 알림은 30초 안에 중복 발송 안 함

## 6. 오류 처리

| 상황 | 처리 |
|---|---|
| git 미설치 | Worktree·Review git 기능 비활성, "git 설치 필요" 안내 |
| 저장소 아님 / 커밋 없음 | Worktree 비활성, Local만 허용. Review 패널에 사유 표시 |
| 브랜치 이름 충돌 | 접미사 재생성 후 1회 재시도. 재실패 시 생성 중단 |
| worktree 생성 중간 실패 | 만들어진 폴더·브랜치 정리 후 오류 안내 |
| worktree 폴더가 외부에서 삭제됨 | 스레드 열 때 감지 → "작업 폴더 없음" 표시, 스레드 삭제만 허용 |
| 스레드 삭제 + 미커밋 변경 | 확인 대화상자 → `git worktree remove --force`. 브랜치 보존(기본) |
| 커밋 실패 (hook 거부 등) | git 출력 원문 표시 |
| push 실패 (인증·거부) | 원문 표시(자격 정보 가림), 재시도. 강제 push 없음 |
| 병합 충돌 | `merge --abort` 후 충돌 목록. 원래 폴더 상태 보존 |
| git 명령 응답 없음 | 로컬 작업 10초, push 120초 시간 제한 후 오류 |
| PTY 시작 실패 | 터미널 탭에 오류. 다른 기능 영향 없음 |
| PTY 비정상 종료 | "터미널 종료됨 · 다시 열기" 표시 |

## 7. 보안

- git·셸 실행: 인자 배열 `execFile`/`pty.spawn`, `shell: false`
- 브랜치 이름: `^artex/[a-z0-9-]{1,60}$`만 생성·허용
- 경로: 화면 입력 경로는 `path-guard`로 스레드 `cwd` 내부만 허용 (`..`, 절대 경로, 심볼릭 링크 탈출 거부 — `realpath` 비교)
- 출력 마스킹: git 오류의 `https://user:token@` 형태 자격 정보 → `https://***@`
- 터미널 환경 변수: `GOOSE_SERVER__SECRET_KEY` 및 `ARTEX_*` 제거
- IPC: 1단계 규칙 유지 (허용 채널 목록, zod 검증, preload 경유)
- 터미널은 사용자 조작 셸 — 샌드박스 미적용 (1단계 스펙 8.3)

## 8. 테스트

| 종류 | 도구 | 대상 |
|---|---|---|
| 단위 | vitest | diff 파서(이름 변경, 바이너리, 공백·한글 경로, CRLF, 새 파일·삭제, 무변경), status 파서, slug(한글·특수문자·길이), path-guard(`..`, 절대 경로, 심볼릭 링크), 코멘트 → 지시문, 알림 판정(포커스·중복 30초), 자격 정보 마스킹 |
| 통합 | vitest + 임시 git 저장소 | worktree 생성·정리, 브랜치 충돌 재시도, stage·unstage·commit, 로컬 bare 원격 push, 로컬 병합 성공·충돌 되돌리기·더티 거부, git 시간 제한 |
| 통합 | vitest | terminal 매니저: 열기·쓰기·출력·크기·종료, 환경 변수 제거 |
| E2E | Playwright Electron + 실제 엔진 + 가짜 LLM | (1) Worktree 스레드 2개 동시 실행, 각자 파일 수정, 서로 간섭 없음 (2) diff 표시 → 줄 코멘트 → 재작업 지시 → 새 diff → 커밋 → 내 브랜치로 가져오기 → 원래 폴더에 반영 확인 (3) 터미널 `echo` 입출력 |
| CI | GitHub Actions | Windows·macOS에서 node-pty 네이티브 빌드 포함 패키징·E2E |

## 9. 완료 기준

- 병렬 Worktree 스레드 2개 동시 실행 E2E 통과
- diff → 줄 코멘트 → 재작업 → 커밋 → 내 브랜치로 가져오기 E2E 통과
- 터미널 입출력 E2E 통과
- `pnpm typecheck`·`pnpm test` 통과, 단위·통합 테스트로 6장 오류 상황 전부 검증
- Windows·macOS CI에서 node-pty 포함 패키징 성공

## 10. 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| node-pty Electron 재빌드 실패 (Windows) | 패키징 실패 | Electron Forge `rebuildConfig` + CI 선검증. 실패 시 터미널만 비활성으로 출시 가능하게 기능 분리 |
| 파일 감시 부하 (대형 저장소) | CPU 사용 증가 | `.git`·`node_modules` 제외, 1초 묶음, 패널 닫히면 감시 중지 |
| 엔진 `cwd`가 worktree 밖 파일 수정 | 격리 깨짐 | 2b 샌드박스에서 차단. 2a는 Review 패널에 worktree 밖 변경 미표시 한계 명시 |
| 사용자 git 설정 차이 (hook, GPG 서명) | 커밋 실패·대기 | 오류 원문 표시, GPG 대기는 시간 제한으로 종료 |
| worktree 누적 | 디스크 사용 증가 | 스레드 삭제 시 정리, 앱 시작 시 `git worktree prune` |

## 11. 미확인 사항

- Codex 앱의 Worktree·Review 실제 동작 원문 (네트워크 정책 차단, 기존 지식 기준)
- node-pty 최신 버전과 Electron 43 호환 여부: 구현 계획 첫 Task에서 확인
- 엔진 developer 확장의 파일 수정 범위가 세션 `cwd`로 제한되는지: 2b 스펙에서 확인
