import { describe, expect, it, vi } from 'vitest';
import { dedupe } from '../../src/renderer/runtime';

describe('dedupe', () => {
  it('동시 호출은 fn을 한 번만 실행하고 같은 promise를 반환', async () => {
    const map = new Map<string, Promise<void>>();
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => (release = r)));
    const a = dedupe(map, 't1', fn);
    const b = dedupe(map, 't1', fn);
    expect(a).toBe(b);
    release();
    await a;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(0);
  });

  it('실패 후에는 정리되어 다시 실행 가능', async () => {
    const map = new Map<string, Promise<void>>();
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    await expect(dedupe(map, 't1', fn)).rejects.toThrow('x');
    await dedupe(map, 't1', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
