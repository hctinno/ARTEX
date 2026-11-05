import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '../../src/renderer/components/Settings';

function fakeApi() {
  return {
    providersList_unstable: vi.fn(async () => ({
      entries: [
        {
          providerId: 'openai',
          providerName: 'OpenAI',
          configured: false,
          defaultModel: 'gpt-x',
          visibleInSetup: true,
          deprecated: false,
          configKeys: [{ name: 'OPENAI_API_KEY', required: true, secret: true }],
          models: [{ id: 'gpt-x', name: 'GPT X' }],
        },
      ],
    })),
    providersConfigSave_unstable: vi.fn(async () => ({})),
    defaultsRead_unstable: vi.fn(async () => ({ providerId: null, modelId: null })),
    defaultsSave_unstable: vi.fn(async () => ({})),
  };
}

describe('Settings', () => {
  it('비밀 키는 password 입력, 저장 시 설정·기본값 저장', async () => {
    const api = fakeApi();
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenAI' }));
    const key = screen.getByLabelText('OPENAI_API_KEY');
    expect(key).toHaveAttribute('type', 'password');
    await userEvent.type(key, 'sk-test');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(api.providersConfigSave_unstable).toHaveBeenCalledWith({
      providerId: 'openai',
      fields: [{ key: 'OPENAI_API_KEY', value: 'sk-test' }],
    });
    expect(api.defaultsSave_unstable).toHaveBeenCalledWith({ providerId: 'openai', modelId: 'gpt-x' });
    expect(await screen.findByText('저장 완료')).toBeInTheDocument();
  });

  it('필수 값 누락 시 저장하지 않고 안내', async () => {
    const api = fakeApi();
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenAI' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(api.providersConfigSave_unstable).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('필수 입력 누락: OPENAI_API_KEY');
  });

  it('엔진 미연결이면 안내만 표시', () => {
    render(<Settings onClose={() => {}} api={null} />);
    expect(screen.getByText('엔진 연결 후 설정 가능')).toBeInTheDocument();
  });
});

function entryApi(entry: Record<string, unknown>) {
  const base = {
    providerId: 'openai',
    providerName: 'OpenAI',
    configured: false,
    defaultModel: 'gpt-x',
    visibleInSetup: true,
    deprecated: false,
    configKeys: [{ name: 'OPENAI_API_KEY', required: true, secret: true }],
    models: [{ id: 'gpt-x', name: 'GPT X' }],
  };
  const api = fakeApi();
  api.providersList_unstable = vi.fn(async () => ({ entries: [{ ...base, ...entry }] }));
  return api;
}

describe('Settings fixes', () => {
  it('설정된 프로바이더는 입력 없이 저장해도 config 저장 없이 기본값만 저장', async () => {
    const api = entryApi({ configured: true });
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: /OpenAI/ }));
    expect(screen.getByText('설정됨')).toBeInTheDocument();
    expect(screen.getByLabelText('OPENAI_API_KEY')).toHaveAttribute('placeholder', '저장된 값 유지');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(api.providersConfigSave_unstable).not.toHaveBeenCalled();
    expect(api.defaultsSave_unstable).toHaveBeenCalledWith({ providerId: 'openai', modelId: 'gpt-x' });
    expect(await screen.findByText('저장 완료')).toBeInTheDocument();
  });

  it('저장 성공 후 비밀 키 입력값을 상태에서 지움', async () => {
    const api = entryApi({});
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenAI' }));
    const key = screen.getByLabelText('OPENAI_API_KEY');
    await userEvent.type(key, 'sk-test');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('저장 완료')).toBeInTheDocument();
    expect(screen.getByLabelText('OPENAI_API_KEY')).toHaveValue('');
  });

  it('모델 목록이 비어 있으면 기본 모델 선택을 숨기고 modelId는 null', async () => {
    const api = entryApi({ configKeys: [], models: [], defaultModel: 'gone' });
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenAI' }));
    expect(screen.queryByLabelText('기본 모델')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(api.defaultsSave_unstable).toHaveBeenCalledWith({ providerId: 'openai', modelId: null });
  });

  it('defaultModel이 목록에 없으면 첫 모델을 초기 선택', async () => {
    const api = entryApi({ configKeys: [], defaultModel: 'zz', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
    render(<Settings onClose={() => {}} api={api as any} />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenAI' }));
    expect(screen.getByLabelText('기본 모델')).toHaveValue('a');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(api.defaultsSave_unstable).toHaveBeenCalledWith({ providerId: 'openai', modelId: 'a' });
  });
});
