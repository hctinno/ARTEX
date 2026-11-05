import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { blend, contrastRatio, selectedBadge, tokens } from '../src/index';

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

describe.each(['light', 'dark'] as const)('%s 선택 행(강조색) 위 상태 배지 대비', (mode) => {
  const accent = tokens[mode].accent;
  it('중립 배지: 흰 글자 on 강조색+오버레이 ≥ 4.5', () => {
    const bg = blend(selectedBadge.overlay, accent, selectedBadge.overlayAlpha);
    expect(contrastRatio(selectedBadge.text, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['warnText', 'delText'] as const)('%s 배지: 흰 바탕 위 글자 ≥ 4.5, 흰 바탕은 강조색과 구분(≥ 3)', (key) => {
    expect(contrastRatio(selectedBadge[key], selectedBadge.solidBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(selectedBadge.solidBg, accent)).toBeGreaterThanOrEqual(3);
  });
});

describe('selectedBadge CSS 변수', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/theme.css'), 'utf8');
  it('theme.css 값이 토큰과 일치', () => {
    expect(css).toContain(`--artex-sel-badge-bg: rgba(0, 0, 0, ${selectedBadge.overlayAlpha});`);
    expect(css).toContain(`--artex-sel-badge-text: ${selectedBadge.text};`);
    expect(css).toContain(`--artex-sel-warn-text: ${selectedBadge.warnText};`);
    expect(css).toContain(`--artex-sel-del-text: ${selectedBadge.delText};`);
    expect(css).toContain(`--artex-sel-solid-bg: ${selectedBadge.solidBg};`);
  });
});

describe('blend', () => {
  it('alpha 0은 바탕, 1은 덧칠 색', () => {
    expect(blend('#000000', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(blend('#000000', '#FFFFFF', 1)).toBe('#000000');
  });
});
