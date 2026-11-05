import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { cargoBuildArgs, installBinary, resolveEngineOutput } from './build-engine.mjs';

test('cargo 빌드는 local-inference(llama.cpp) 없이 나머지 기본 기능만 켠다', () => {
  const args = cargoBuildArgs();
  assert.deepEqual(args.slice(0, 6), ['build', '--release', '-p', 'goose-cli', '--bin', 'goose']);
  assert.ok(args.includes('--no-default-features'));
  const features = args[args.indexOf('--features') + 1].split(',');
  assert.ok(!features.includes('local-inference'));
  for (const f of ['code-mode', 'tree-sitter', 'rustls-tls', 'system-keyring', 'bundled-mcp', 'scheduler', 'acp-http']) {
    assert.ok(features.includes(f), `${f} 누락`);
  }
});

test('설치는 기존 바이너리를 덮어쓰지 않고 새 파일로 교체한다 (실행 중 바이너리 보호)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artex-install-'));
  const source = path.join(dir, 'new-goose');
  const target = path.join(dir, 'bin', 'goose');
  fs.writeFileSync(source, 'new');
  fs.mkdirSync(path.dirname(target));
  fs.writeFileSync(target, 'old');
  const oldInode = fs.statSync(target).ino;
  installBinary(source, target, 'linux');
  assert.equal(fs.readFileSync(target, 'utf8'), 'new');
  assert.notEqual(fs.statSync(target).ino, oldInode);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['goose']);
  fs.rmSync(dir, { recursive: true, force: true });
});

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
