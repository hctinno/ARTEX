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
