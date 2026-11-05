# 엔진 수정 지점

기준: aaif-goose/goose bfe8ccd23de1d2c47a4cb2970d522f093ae7f2ba

| 날짜 | 파일 | 목적 | 업스트림 제안 |
|---|---|---|---|
| (없음) | | 1단계는 엔진 코드 수정 없음 | |

## 빌드 구성 (엔진 코드 수정 아님)

| 날짜 | 위치 | 내용 | 이유 |
|---|---|---|---|
| 2026-11-05 | `scripts/build-engine.mjs` | `--no-default-features` + 기본 기능에서 `local-inference`만 제외 | 원격 모델(사내 게이트웨이) 전제라 llama.cpp 불필요. llama.cpp의 cpp-httplib가 macOS 러너 최신 OpenSSL 헤더와 컴파일 충돌 |
| 2026-11-05 | `.github/workflows/ci.yml` | `MACOSX_DEPLOYMENT_TARGET=12.0` | 업스트림 `bundle-macos.yml`과 동일 |
