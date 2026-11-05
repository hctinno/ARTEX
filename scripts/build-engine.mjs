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

// goose-cli 기본 기능에서 local-inference(llama.cpp)만 제외: ARTEX는 사내 게이트웨이 경유 원격 모델을 쓰고,
// llama.cpp의 cpp-httplib가 macOS 러너의 최신 OpenSSL 헤더와 컴파일 충돌한다.
export const ENGINE_FEATURES = [
  'code-mode',
  'tree-sitter',
  'aws-providers',
  'telemetry',
  'otel',
  'rustls-tls',
  'live-voice',
  'system-keyring',
  'update',
  'bundled-mcp',
  'scheduler',
  'platform-apps',
  'chat-recall',
  'acp-http',
  'online-model-meta',
];

export function cargoBuildArgs() {
  return [
    'build',
    '--release',
    '-p',
    'goose-cli',
    '--bin',
    'goose',
    '--no-default-features',
    '--features',
    ENGINE_FEATURES.join(','),
  ];
}

// 실행 중일 수 있는 바이너리를 제자리에서 덮어쓰면 macOS가 해당 프로세스를 종료시키므로 새 파일로 교체한다.
export function installBinary(source, target, platform) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = `${target}.new`;
  fs.copyFileSync(source, staging);
  if (platform !== 'win32') fs.chmodSync(staging, 0o755);
  fs.rmSync(target, { force: true });
  fs.renameSync(staging, target);
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync('cargo', cargoBuildArgs(), {
    cwd: path.join(repoRoot, 'engine'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`cargo build 실패 (exit ${result.status ?? result.error?.message})`);
    process.exit(result.status ?? 1);
  }
  const { source, target } = resolveEngineOutput(process.platform, repoRoot);
  installBinary(source, target, process.platform);
  console.log(`엔진 복사 완료: ${target}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
