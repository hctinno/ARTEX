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
