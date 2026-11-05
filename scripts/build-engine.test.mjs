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
