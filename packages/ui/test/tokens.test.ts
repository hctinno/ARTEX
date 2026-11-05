import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { contrastRatio, tokens } from '../src/index';

describe('contrastRatio', () => {
  it('흑백 대비는 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });
  it('같은 색은 1', () => {
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe.each(['light', 'dark'] as const)('%s 토큰 대비', (mode) => {
  const t = tokens[mode];
  it.each([
    ['text', 'pane'],
    ['text', 'card'],
    ['muted', 'pane'],
    ['muted', 'card'],
    ['addText', 'pane'],
    ['delText', 'pane'],
    ['warnText', 'pane'],
  ] as const)('%s on %s ≥ 4.5', (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it('강조색 위 흰 글자 ≥ 4.5', () => {
    expect(contrastRatio('#FFFFFF', t.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/theme.css'), 'utf8');
  it.each(Object.keys(tokens.light))('--artex-%s 변수가 정의돼 있다', (key) => {
    const name = `--artex-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`;
    expect(css).toContain(`${name}:`);
  });
});
