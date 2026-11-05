import { describe, expect, it } from 'vitest';
import { availableChoices, pickOptionId } from '../src/index';

const full = [
  { optionId: 'o1', name: 'Allow', kind: 'allow_once' },
  { optionId: 'o2', name: 'Always', kind: 'allow_always' },
  { optionId: 'o3', name: 'Deny', kind: 'reject_once' },
];

describe('pickOptionId', () => {
  it('선택별 optionId', () => {
    expect(pickOptionId(full, 'allow_once')).toBe('o1');
    expect(pickOptionId(full, 'allow_always')).toBe('o2');
    expect(pickOptionId(full, 'reject')).toBe('o3');
  });
  it('reject_once가 없으면 reject_always 사용', () => {
    expect(pickOptionId([{ optionId: 'r', name: 'x', kind: 'reject_always' }], 'reject')).toBe('r');
  });
  it('없는 선택은 null', () => {
    expect(pickOptionId([full[0]!], 'allow_always')).toBeNull();
  });
});

describe('availableChoices', () => {
  it('제공된 선택만 반환', () => {
    expect(availableChoices([full[0]!, full[2]!])).toEqual(['allow_once', 'reject']);
  });
});
