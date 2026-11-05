function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`hex 색만 지원: ${hex}`);
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => channel(parseInt(h, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** 불투명 바탕(bg) 위에 alpha로 덧칠한 색(fg)의 합성 결과(hex). */
export function blend(fg: string, bg: string, alpha: number): string {
  const rgb = (hex: string) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) throw new Error(`hex 색만 지원: ${hex}`);
    return [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16));
  };
  const f = rgb(fg);
  const b = rgb(bg);
  return (
    '#' +
    f
      .map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)))
      .map((c) => c.toString(16).padStart(2, '0').toUpperCase())
      .join('')
  );
}
