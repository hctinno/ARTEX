import path from 'node:path';
import fs from 'node:fs';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { devCsp } from '../../vite.dev-csp.mjs';

const appDir = path.resolve(__dirname, '../..');
const PROD_CSP = "default-src 'self'; connect-src 'self' ws://127.0.0.1:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

describe('devCsp', () => {
  it('script-src에 인라인(React preamble)을, connect-src에 Vite HMR ws를 더하고 나머지는 유지', () => {
    expect(devCsp(PROD_CSP)).toBe(
      "default-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-inline'"
    );
  });
  it('script-src가 이미 있으면 거기에 덧붙인다', () => {
    expect(devCsp("default-src 'self'; script-src 'self'")).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:*"
    );
  });
});

describe('index.html CSP: dev 서버 vs 원본', () => {
  let server: ViteDevServer;
  beforeAll(async () => {
    server = await createServer({
      configFile: path.join(appDir, 'vite.renderer.config.mts'),
      root: appDir,
      logLevel: 'error',
      server: { middlewareMode: true, ws: false },
    });
  }, 30_000);
  afterAll(async () => {
    await server?.close();
  });

  it('원본(프로덕션 빌드 입력)은 엄격한 CSP 그대로', () => {
    const raw = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    expect(raw).toContain(`content="${PROD_CSP}"`);
  });

  it('dev 변환 결과는 preamble 인라인 스크립트를 허용하는 dev CSP를 쓴다', async () => {
    const raw = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    const html = await server.transformIndexHtml('/', raw);
    expect(html).toMatch(/<script type="module">[^<]*injectIntoGlobalHook/);
    expect(html).toContain(`content="${devCsp(PROD_CSP)}"`);
    expect(html).not.toContain(`content="${PROD_CSP}"`);
  });
});
