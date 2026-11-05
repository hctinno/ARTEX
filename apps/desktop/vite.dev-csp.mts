import type { Plugin } from 'vite';

/**
 * index.html의 CSP는 프로덕션 기준(엄격)이다. Vite dev 서버에서만 다음을 더한다.
 * - script-src 'unsafe-inline': @vitejs/plugin-react가 주입하는 인라인 Fast Refresh preamble
 * - connect-src ws://localhost:*: Vite HMR 웹소켓
 * (지금은 preamble이 CSP meta보다 앞에 주입돼 우연히 통과하지만, 그 순서에 기대지 않는다.)
 */
export function devCsp(csp: string): string {
  const directives = csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => d.split(/\s+/));
  const add = (name: string, fallback: string[], values: string[]) => {
    let d = directives.find((x) => x[0] === name);
    if (!d) directives.push((d = [name, ...fallback]));
    for (const v of values) if (!d.includes(v)) d.push(v);
  };
  add('script-src', ["'self'"], ["'unsafe-inline'"]);
  add('connect-src', ["'self'"], ['ws://localhost:*']);
  return directives.map((d) => d.join(' ')).join('; ');
}

const META_CSP = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;

/** dev 서버(serve)에서만 적용된다. 빌드(electron-forge package/make)의 index.html은 건드리지 않는다. */
export function devCspPlugin(): Plugin {
  return {
    name: 'artex:dev-csp',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!META_CSP.test(html)) throw new Error('index.html에 CSP meta가 없음');
        return html.replace(META_CSP, (_, a: string, csp: string, b: string) => a + devCsp(csp) + b);
      },
    },
  };
}
