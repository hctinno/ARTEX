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
