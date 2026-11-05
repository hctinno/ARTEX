import path from 'node:path';

/**
 * Squirrel.Windows 설치기 수명주기 이벤트(--squirrel-install/updated/uninstall/obsolete).
 * 이벤트로 실행되면 바로가기를 만들거나 지운 뒤 즉시 종료해야 한다(창을 띄우면 설치기가 멈춘다).
 * electron-squirrel-startup과 같은 동작을 의존성 없이 구현한다.
 */
export type SquirrelAction =
  | { quit: false }
  | { quit: true; updateExe: string; updateArgs: string[] | null };

export function squirrelAction(argv: readonly string[], platform: NodeJS.Platform, execPath: string): SquirrelAction {
  if (platform !== 'win32') return { quit: false };
  const flag = argv[1];
  const exeName = path.win32.basename(execPath);
  const updateExe = path.win32.resolve(path.win32.dirname(execPath), '..', 'Update.exe');
  switch (flag) {
    case '--squirrel-install':
    case '--squirrel-updated':
      return { quit: true, updateExe, updateArgs: [`--createShortcut=${exeName}`] };
    case '--squirrel-uninstall':
      return { quit: true, updateExe, updateArgs: [`--removeShortcut=${exeName}`] };
    case '--squirrel-obsolete':
      return { quit: true, updateExe, updateArgs: null };
    default:
      return { quit: false };
  }
}

interface ChildLike {
  on(event: 'close' | 'error', cb: () => void): unknown;
}

/** 이벤트를 처리했으면 true(호출자는 앱 초기화를 건너뛴다). */
export function handleSquirrelEvent(
  argv: readonly string[],
  platform: NodeJS.Platform,
  execPath: string,
  deps: { spawn(cmd: string, args: string[], opts: { detached: true }): ChildLike; quit(): void }
): boolean {
  const action = squirrelAction(argv, platform, execPath);
  if (!action.quit) return false;
  if (!action.updateArgs) {
    deps.quit();
    return true;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    deps.quit();
  };
  try {
    const child = deps.spawn(action.updateExe, action.updateArgs, { detached: true });
    child.on('close', finish);
    child.on('error', finish);
  } catch {
    finish();
  }
  return true;
}
