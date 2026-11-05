# ARTEX IDE 설계 스펙

- 작성일: 2026-11-05
- 상태: 검토 대기
- 범위: 전체 구조 + 1단계(골격 MVP) 상세. 2~4단계는 단계별 별도 스펙으로 작성
- 기준 엔진: `aaif-goose/goose` 커밋 `bfe8ccd` (2026-11-04)

---

## 1. 목표

- Goose 오픈소스 엔진 기반의 사내 전용 데스크톱 코딩 에이전트 IDE
- 레이아웃·기능: Codex 데스크톱 앱 방식
- 시각 디자인: 자체 iOS 스타일 (라이트·다크)
- 엔진 능력: Goose와 동일 + Codex 고유 기능(Worktree, Review, 터미널, OS 샌드박스) 추가

## 2. 확정된 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 제품 형태 | Codex 앱형 데스크톱 | 사용자 선택 |
| 사용자 | 사내 팀 전용 | 사용자 선택 |
| 대상 OS | Windows 1순위, macOS 2순위 | 사용자 환경 |
| 모델 | 개발 중 다중 프로바이더, 최종 사내 게이트웨이 경유 온프레미스 모델 | 사용자 지시 |
| 시각 디자인 | 시안 B(Light) + 시안 A(Dark), OS 다크 모드 자동 추종 | 사용자 선택 |
| 엔진 통합 | 엔진 포크 + `goose serve` ACP 연결 | Goose `CUSTOM_DISTROS.md`의 공식 커스텀 UI 경로 |
| 앱 스택 | Electron + React 19 + Tailwind 4 + Radix + Vite + Electron Forge | Goose Desktop과 동일 스택, 빌드·패키징 재사용 |
| 샌드박스 | 2단계에 OS 수준 격리 추가 | Goose 셸 도구에 OS 격리 부재 확인 |

## 3. 비목표

- Codex 아이콘·로고·문구·화면 에셋의 픽셀 복제
- Goose·Codex 명칭 및 상표 사용
- Cloud 스레드(원격 컨테이너 실행): 사내 서버 확보 후 별도 검토
- Goose Rust 코어의 대규모 재작성

## 4. 법적 조건

- Apache 2.0 준수
  - 원본 `LICENSE`, 저작권 고지 유지
  - `NOTICE`에 수정 사실 명시
  - "Goose" 명칭을 공식 보증처럼 사용 금지
- Codex 참조 범위: 화면 배치, 정보 구조, 기능 흐름만
- 텔레메트리: `GOOSE_DISABLE_TELEMETRY=1` 기본 적용

## 5. 아키텍처

```
ARTEX (monorepo, pnpm workspace)
├─ engine/          aaif-goose/goose 포크 (git subtree, upstream 주기 merge)
├─ apps/desktop/
│   ├─ main/        Node 프로세스: goose serve 관리, git, worktree, 터미널, 알림, 업데이트
│   ├─ preload/     렌더러용 좁은 IPC API (타입 고정, zod 검증)
│   └─ renderer/    Codex 레이아웃 UI
├─ packages/
│   ├─ ui/          iOS 스타일 컴포넌트 + 라이트·다크 토큰
│   ├─ core/        스레드·프로젝트 모델, ACP 세션 연결 (@aaif/goose-acp-client)
│   ├─ git/         diff 파싱, stage·commit·push, worktree 생성·정리
│   └─ sandbox/     샌드박스 정책 모델 + OS별 실행기 (2단계)
└─ docs/            스펙, 계획, NOTICE, 엔진 수정 지점 목록
```

### 5.1 계층별 책임

| 계층 | 책임 | 비고 |
|---|---|---|
| engine (Rust) | 대화, 도구 실행, MCP, 프로바이더, 승인 판단 | 설정·선언형 프로바이더 우선, 코드 수정 최소화 |
| main (Node) | 엔진 프로세스 수명, git·worktree, 터미널(node-pty), OS 알림, 로컬 DB | Codex 고유 기능의 백엔드 |
| preload | 허용 목록 기반 IPC 노출 | 보안 경계 |
| renderer | 화면 렌더링 전용 | 파일 시스템·git 직접 접근 금지 |

### 5.2 엔진 수정 원칙

- 수정 지점은 `docs/engine-patches.md`에 파일·목적·업스트림 제안 여부로 기록
- 예상 수정 지점
  - 브랜딩 문자열
  - 사내 게이트웨이 선언형 프로바이더 (`crates/goose/src/providers/declarative/`)
  - 샌드박스 연동: 셸 도구 (`crates/goose/src/agents/platform_extensions/developer/shell.rs`)와 파일 쓰기 도구의 경로 검사
  - 시스템 프롬프트 조정 (`crates/goose/src/prompts/`)
- 업스트림 merge: 월 1회 + 보안 릴리스 시 즉시

## 6. 화면 구성 (Codex 레이아웃)

| 영역 | 구성 요소 | 단계 |
|---|---|---|
| 사이드바 | 새 스레드, 자동화(검토 배지), 스킬, 프로젝트별 스레드 그룹 목록(상태 배지), 사용자·설정 | 1 (자동화·스킬 항목은 3) |
| 스레드 헤더 | 브랜치·스레드 종류, 큰 제목, 외부 IDE 열기, 커밋 | 1 (커밋은 2) |
| 대화 | 사용자 말풍선, 에이전트 텍스트, 사고 과정(접힘), 명령 실행 카드, 변경 파일 칩, 계획 목록, 승인 카드 | 1 |
| 입력창 | 첨부, Local/Worktree, 모델, 추론 강도, 승인·샌드박스 모드, 보내기·중단, 슬래시 명령, @파일 | 1 (Worktree는 2, 샌드박스 모드는 2) |
| Review 패널 | 세그먼트 탭(변경 사항·터미널·PR), 파일 스테이징, diff, 줄 코멘트, 커밋 메시지, 커밋·PR | 2 (PR은 3) |
| 설정 | 프로바이더·모델, 승인 기본값, 테마, MCP 확장 | 1 (MCP 화면은 3) |

### 6.1 디자인 토큰

- 기준: 시안 B(Light), 시안 A(Dark). 원본 `ARTEX IDE 스타일 시안` 캔버스
- 형태
  - 패널: 독립 플로팅 카드, 모서리 24px, 패널 간 간격 10px
  - 목록: 그룹형 둥근 목록, 행 모서리 12px, 행 높이 44px 이상
  - 버튼: 캡슐형, 주 버튼 강조색 채움, 보조 버튼 회색 채움, 테두리 없음
  - 탭: 세그먼트 컨트롤
  - 선택: 원형 체크
- 서체: `-apple-system, 'SF Pro Text', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`, 코드 `'SF Mono', 'JetBrains Mono', monospace`
- 색 (주요 토큰)

| 토큰 | Light | Dark |
|---|---|---|
| bg | #E9E9EE | #000000 |
| pane | #FFFFFF | #161618 |
| card | #F3F3F6 | #232326 |
| text | #1C1C1E | #F5F5F7 |
| muted | #6C6C70 | #A1A1A8 |
| fill | rgba(118,118,128,0.12) | rgba(120,120,128,0.26) |
| accent | #0B6BDB | #1F6FE5 |
| add / del 글자 | #1B7A3C / #B3261E | #5FD98A / #FF8A80 |
| warn 글자 | #8F4A00 | #FFB340 |

- 접근성: 본문 대비 4.5:1 이상, 추가·삭제는 색과 +/− 기호 병행, 아이콘 버튼 `aria-label`

## 7. 데이터 흐름

### 7.1 앱 시작

1. main: 빈 포트 확보, 실행마다 임의 비밀키 생성
2. main: `goose serve --host 127.0.0.1 --port <p>` 실행, `GOOSE_SERVER__SECRET_KEY`·`GOOSE_DISABLE_TELEMETRY=1` 전달
3. renderer: 토큰 포함 WebSocket 접속, `initialize` 호출. 로그의 토큰은 가림 처리

### 7.2 스레드 생성

| 종류 | 처리 | 단계 |
|---|---|---|
| Local | 프로젝트 경로를 `cwd`로 `session/new` | 1 |
| Worktree | `git worktree add <앱데이터>/worktrees/<스레드ID> -b artex/<slug>` 후 해당 경로를 `cwd`로 `session/new` | 2 |

- 로컬 DB(SQLite): 스레드 ID, 프로젝트, 종류, 브랜치, worktree 경로, 세션 ID, 상태, 제목, 생성·갱신 시각
- 대화 내용은 Goose 세션 저장소에 위임, 재개 시 `session/load`

### 7.3 지시 → 응답

1. 입력창 → `session/prompt`
2. 모델·추론 강도·승인 모드 변경 → `session/setConfigOption`
3. `session/update` 스트림 → 화면 요소 변환 (변환 함수는 순수 함수, 단위 테스트 대상)

| 엔진 이벤트 | 화면 요소 |
|---|---|
| 메시지 조각 | 에이전트 텍스트 |
| thinking | 접힌 사고 과정 |
| 도구 호출·결과 | 명령 실행 카드 |
| 파일 수정 | 변경 파일 칩 |
| plan | 계획 목록 |

4. `session/requestPermission` → 승인 카드 → 승인 / 이 세션 동안 허용 / 거부 응답
5. 중단 → `session/cancel`

### 7.4 Review 패널 (2단계)

- main이 스레드 `cwd`에서 git 직접 실행: `status`, `diff`, `add`, `commit`, `push`
- 파일 수정 이벤트·파일 변경 감시로 diff 재계산
- 줄 코멘트 → "파일:줄 + 코멘트" 묶음 후속 지시로 `session/prompt`

### 7.5 병렬 스레드

- 스레드별 독립 세션, 단일 서버에서 다중 세션 처리
- 상태: 실행 중 · 승인 대기 · 완료 · 오류. 스트림 이벤트로 갱신
- 창이 백그라운드일 때 승인 대기·완료·오류 OS 알림

## 8. 샌드박스 (2단계)

### 8.1 배경

- Goose 셸 도구: OS 수준 격리 없음 (코드 검색 확인). 승인 모드는 실행 여부만 통제
- 목표: Codex 방식처럼 실행된 명령의 쓰기 범위와 네트워크 제한

### 8.2 정책 모델

| 모드 | 파일 읽기 | 파일 쓰기 | 네트워크 | 기본 승인 |
|---|---|---|---|---|
| 읽기 전용 | 전체 | 불가 | 차단 | 모든 쓰기·명령 승인 필요 |
| 작업공간 쓰기 (기본) | 전체 | 스레드 `cwd` + 임시 폴더만 | 차단 | 범위 밖 쓰기·네트워크 필요 시 승인 카드 |
| 전체 접근 | 전체 | 전체 | 허용 | 승인 없음 (경고 표시) |

- 쓰기 금지 고정 경로: `.git` 내부 설정·훅, 사용자 홈 설정 파일, ARTEX 앱 데이터
- 승인 시 해당 명령 1회만 샌드박스 밖 실행, "이 세션 동안 허용"은 명령 접두어 단위
- 입력창의 승인 모드 선택 = 샌드박스 모드 + `GooseMode` 조합

### 8.3 적용 지점

| 대상 | 방식 |
|---|---|
| 셸 명령 (엔진 하위 프로세스) | 엔진 셸 도구의 프로세스 생성을 `artex-sandbox` 실행기로 감쌈 |
| 파일 쓰기 도구 (엔진 프로세스 자체) | 엔진 도구 계층에서 쓰기 경로 허용 목록 검사 |
| 통합 터미널 (사용자 조작) | 샌드박스 미적용 (사용자 본인 조작) |

### 8.4 OS별 실행기

| OS | 방식 | 위험도 |
|---|---|---|
| Windows | 제한 토큰 + Job Object + 작업공간 ACL, 네트워크는 Windows Filtering Platform 규칙 | 높음. 2단계 착수 시 기술 검증(spike) 선행 |
| macOS | Seatbelt 프로필 (`sandbox-exec`) | 중간. `sandbox-exec` 지원 중단 예고 상태 확인 필요 |
| Linux | Landlock + seccomp | 낮음 (참고용, 대상 OS 아님) |

- 실행기 실패 시 정책: 명령을 샌드박스 없이 실행하지 않음. 오류 카드 + "전체 접근으로 1회 실행" 승인 선택지 제공

## 9. 오류 처리

| 상황 | 처리 |
|---|---|
| `goose serve` 비정상 종료 | 지수 백오프 재시작 최대 3회. 실패 시 진단 화면 + 로그 경로. 진행 중 스레드는 오류 상태, `session/load`로 복구 |
| 프로바이더 인증·한도 오류 | 스레드 내 오류 카드 + 설정 링크 + 재시도 |
| worktree 생성 실패 | 스레드 미생성, 원인·해결 안내, 반쪽 worktree 정리 |
| 스레드 삭제 | 미커밋 변경 존재 시 확인 후 삭제, 브랜치 기본 보존 |
| git push 실패 | 원문 오류 표시 + 재시도. 강제 push 미제공 |
| 샌드박스 실행기 실패 | 8.4 정책 적용 |

## 10. 보안

- renderer: `nodeIntegration` 끔, `contextIsolation` 켬, `sandbox` 켬
- IPC: 허용 명령 목록, 인자 zod 검증
- 엔진 서버: 127.0.0.1 전용, 실행마다 새 토큰
- 비밀 정보: OS 키체인 저장 (Goose `SecretStorage` 사용), 로그 마스킹

## 11. 테스트

| 종류 | 도구 | 대상 |
|---|---|---|
| 단위 | vitest | ACP 이벤트→화면 변환, diff 파서, 스레드 상태 전이, worktree 경로·브랜치 규칙, 샌드박스 정책 판정 |
| 통합 | vitest + 임시 git 저장소 | worktree 생성·커밋·정리, 가짜 ACP 서버로 스트림·승인·취소 |
| E2E | Playwright Electron | 실제 엔진 + 테스트 프로바이더로 스레드 생성 → 지시 → 승인 → 결과 |
| 시각 회귀 | Playwright 스크린샷 | 라이트·다크 핵심 화면 |
| 샌드박스 | OS별 통합 테스트 | 작업공간 밖 쓰기 차단, 네트워크 차단, 승인 후 1회 허용 |
| CI | GitHub Actions | Windows·macOS 빌드 + 테스트 |

- 테스트 프로바이더: Goose `crates/goose-test-support` 활용 가능 여부를 계획 단계에서 확인

## 12. 단계

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 1. 골격 MVP | 엔진 포크·빌드, Electron 셸, ACP 연결, 사이드바·스레드·입력창, Local 스레드, 승인 카드, 라이트·다크 테마, 프로바이더 설정 | Windows 설치 파일 빌드 성공, 라이트·다크에서 Local 스레드 E2E 통과, 다중 프로바이더 설정 동작 |
| 2. Codex 핵심 | Worktree 스레드, Review 패널, 통합 터미널, 병렬 상태·알림, OS 샌드박스 | 병렬 Worktree 스레드 2개 동시 실행 E2E, diff→코멘트→커밋 E2E, Windows 샌드박스 차단 테스트 통과 |
| 3. 확장 | 스킬(레시피 연결), 자동화(스케줄·검토 큐), PR 생성·피드백 반영, MCP 관리 화면 | 단계 스펙에서 정의 |
| 4. 사내화 | 사내 게이트웨이 프로바이더, 설정 잠금, 코드서명, 자동 업데이트, 텔레메트리 차단 검증 | 단계 스펙에서 정의 |

## 13. 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| `goose serve` ACP 확장 메서드(`_goose/unstable/*`) 변경 | UI 기능 깨짐 | 표준 ACP 메서드 우선 사용, 계약 테스트로 고정, merge 시 검증 |
| 업스트림 merge 충돌 | 보안 패치 지연 | 엔진 수정 최소화, 수정 지점 목록 관리 |
| Windows 샌드박스 구현 난도 | 2단계 일정 지연 | 2단계 착수 시 spike 선행, 실패 시 범위 축소안(쓰기 범위 제한 우선, 네트워크 차단 후순위) |
| 온프레미스 모델 성능 | 결과물 품질 저하 | 엔진과 무관. 4단계에서 모델 평가 별도 수행 |
| Codex 기능 원문 미검증 | 기능 누락 | `developers.openai.com` 접근 가능한 환경에서 각 단계 스펙 작성 시 원문 대조 |

## 14. 미확인 사항

- Codex 앱 기능 목록: OpenAI 문서가 이 세션의 네트워크 정책에 막혀 원문 미확인. 검색 요약 + 기존 지식 기준
- Codex 샌드박스 방식(OS 격리): 기존 지식 기준, 원문 미확인
- `goose serve` 다중 세션 동시 처리 한계: 1단계 구현 중 측정
- macOS `sandbox-exec` 지속 가능성: 2단계 스펙에서 확인
