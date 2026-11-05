import { describe, expect, it } from 'vitest';
import { buildEngineUrls, redact } from '../../src/main/engine-urls';

describe('buildEngineUrls', () => {
  it('127.0.0.1 http·ws 주소를 만든다', () => {
    expect(buildEngineUrls(4123, 'abc+/=')).toEqual({
      httpBase: 'http://127.0.0.1:4123',
      statusUrl: 'http://127.0.0.1:4123/status',
      acpUrl: 'ws://127.0.0.1:4123/acp?token=abc%2B%2F%3D',
    });
  });
});

describe('redact', () => {
  it('원문과 URL 인코딩된 비밀키를 모두 가린다', () => {
    const secret = 'abc+/=';
    const line = `token=${secret} url=ws://x/acp?token=${encodeURIComponent(secret)}`;
    expect(redact(line, secret)).toBe('token=REDACTED url=ws://x/acp?token=REDACTED');
  });
  it('빈 비밀키는 원문 그대로', () => {
    expect(redact('hello', '')).toBe('hello');
  });
});
