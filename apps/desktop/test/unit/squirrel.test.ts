import { describe, expect, it, vi } from 'vitest';
import { handleSquirrelEvent, squirrelAction } from '../../src/main/squirrel';

const exe = 'C:\\Users\\u\\AppData\\Local\\artex\\app-0.1.0\\artex.exe';

describe('squirrelAction', () => {
  it.each([
    ['--squirrel-install', ['--createShortcut=artex.exe']],
    ['--squirrel-updated', ['--createShortcut=artex.exe']],
    ['--squirrel-uninstall', ['--removeShortcut=artex.exe']],
    ['--squirrel-obsolete', null],
  ] as const)('%s → Update.exe %j 후 종료', (flag, updateArgs) => {
    expect(squirrelAction([exe, flag], 'win32', exe)).toEqual({
      quit: true,
      updateExe: 'C:\\Users\\u\\AppData\\Local\\artex\\Update.exe',
      updateArgs,
    });
  });
  it('플래그가 없으면 아무것도 하지 않는다', () => {
    expect(squirrelAction([exe], 'win32', exe)).toEqual({ quit: false });
    expect(squirrelAction([exe, '--squirrel-firstrun'], 'win32', exe)).toEqual({ quit: false });
  });
  it('Windows가 아니면 무시', () => {
    expect(squirrelAction(['/usr/bin/artex', '--squirrel-install'], 'linux', '/usr/bin/artex')).toEqual({ quit: false });
  });
});

describe('handleSquirrelEvent', () => {
  it('Update.exe를 분리 실행하고 끝나면 quit', () => {
    let onClose: (() => void) | undefined;
    const spawn = vi.fn(() => ({ on: (ev: string, cb: () => void) => { if (ev === 'close') onClose = cb; } }));
    const quit = vi.fn();
    expect(handleSquirrelEvent([exe, '--squirrel-install'], 'win32', exe, { spawn, quit })).toBe(true);
    expect(spawn).toHaveBeenCalledWith('C:\\Users\\u\\AppData\\Local\\artex\\Update.exe', ['--createShortcut=artex.exe'], { detached: true });
    expect(quit).not.toHaveBeenCalled();
    onClose!();
    expect(quit).toHaveBeenCalledTimes(1);
  });
  it('Update.exe 실행 실패(error)에도 quit', () => {
    let onError: (() => void) | undefined;
    const spawn = vi.fn(() => ({ on: (ev: string, cb: () => void) => { if (ev === 'error') onError = cb; } }));
    const quit = vi.fn();
    handleSquirrelEvent([exe, '--squirrel-uninstall'], 'win32', exe, { spawn, quit });
    onError!();
    expect(quit).toHaveBeenCalledTimes(1);
  });
  it('obsolete는 Update.exe 없이 바로 quit', () => {
    const spawn = vi.fn();
    const quit = vi.fn();
    expect(handleSquirrelEvent([exe, '--squirrel-obsolete'], 'win32', exe, { spawn, quit })).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledTimes(1);
  });
  it('이벤트가 없으면 false', () => {
    expect(handleSquirrelEvent([exe], 'win32', exe, { spawn: vi.fn(), quit: vi.fn() })).toBe(false);
  });
});
