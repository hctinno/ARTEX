import { describe, expect, it } from 'vitest';
import { normalizeConfigOptions } from '../src/index';

describe('normalizeConfigOptions', () => {
  it('평면 select 옵션', () => {
    const raw = [
      {
        type: 'select',
        id: 'mode',
        name: 'Mode',
        currentValue: 'auto',
        options: [
          { value: 'auto', name: 'auto' },
          { value: 'approve', name: 'approve' },
        ],
      },
    ];
    expect(normalizeConfigOptions(raw)).toEqual([
      {
        id: 'mode',
        name: 'Mode',
        currentValue: 'auto',
        options: [
          { value: 'auto', name: 'auto' },
          { value: 'approve', name: 'approve' },
        ],
      },
    ]);
  });

  it('그룹 옵션은 펼친다', () => {
    const raw = [
      {
        type: 'select',
        id: 'model',
        name: 'Model',
        currentValue: 'b',
        options: [{ group: 'g', name: 'G', options: [{ value: 'a', name: 'A' }, { value: 'b', name: 'B' }] }],
      },
    ];
    expect(normalizeConfigOptions(raw)[0]!.options).toEqual([
      { value: 'a', name: 'A' },
      { value: 'b', name: 'B' },
    ]);
  });

  it('배열이 아니거나 형식이 틀린 항목은 버린다', () => {
    expect(normalizeConfigOptions(undefined)).toEqual([]);
    expect(normalizeConfigOptions([{ id: 1 }, null, { type: 'select', id: 'x' }])).toEqual([]);
  });
});
