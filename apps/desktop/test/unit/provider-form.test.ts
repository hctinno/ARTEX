import { describe, expect, it } from 'vitest';
import { buildConfigFields, visibleProviders } from '../../src/renderer/settings/provider-form';

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  providerId: id,
  providerName: id.toUpperCase(),
  configured: false,
  defaultModel: 'm1',
  visibleInSetup: true,
  deprecated: false,
  configKeys: [],
  models: [{ id: 'm1', name: 'M1' }],
  ...extra,
});

describe('visibleProviders', () => {
  it('숨김·폐기 제외, 이름순', () => {
    const out = visibleProviders([entry('openai'), entry('anthropic'), entry('old', { deprecated: true }), entry('hid', { visibleInSetup: false })]);
    expect(out.map((p) => p.providerId)).toEqual(['anthropic', 'openai']);
  });
});

describe('buildConfigFields', () => {
  const keys = [
    { name: 'OPENAI_API_KEY', required: true, secret: true },
    { name: 'OPENAI_HOST', required: false, secret: false, default: 'https://api.openai.com' },
  ];
  it('입력된 값만 전송, 필수 누락 보고', () => {
    expect(buildConfigFields(keys, { OPENAI_HOST: 'http://gw' })).toEqual({
      fields: [{ key: 'OPENAI_HOST', value: 'http://gw' }],
      missing: ['OPENAI_API_KEY'],
    });
  });
  it('공백 값은 미입력 취급', () => {
    expect(buildConfigFields(keys, { OPENAI_API_KEY: '  ' }).missing).toEqual(['OPENAI_API_KEY']);
  });
});

describe('buildConfigFields (configured)', () => {
  const keys = [{ name: 'OPENAI_API_KEY', required: true, secret: true }];
  it('설정된 프로바이더는 빈 필수 키를 누락으로 보지 않음 (저장된 값 유지)', () => {
    expect(buildConfigFields(keys, {}, true)).toEqual({ fields: [], missing: [] });
  });
});
