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

macOS: `apps/desktop/out/make/zip/darwin/<arch>/ARTEX-darwin-<arch>-<version>.zip`
