import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalCard } from '../../src/renderer/components/ApprovalCard';
import { Composer } from '../../src/renderer/components/Composer';
import { StatusBadge } from '../../src/renderer/components/StatusBadge';
import { ThreadView } from '../../src/renderer/components/ThreadView';

const perm = {
  kind: 'permission' as const,
  id: 'permission-0',
  requestId: 'perm-1',
  title: 'git push',
  detail: 'git push -u origin fix',
  available: ['allow_once', 'reject'] as ('allow_once' | 'allow_always' | 'reject')[],
  resolved: null,
};

describe('ApprovalCard', () => {
  it('제공된 선택만 활성화, 클릭 시 onChoose', async () => {
    const onChoose = vi.fn();
    render(<ApprovalCard item={perm} onChoose={onChoose} />);
    expect(screen.getByRole('button', { name: '이 세션 동안 허용' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(onChoose).toHaveBeenCalledWith('allow_once');
    expect(screen.getByText('git push -u origin fix')).toBeInTheDocument();
  });

  it('해결된 카드는 버튼 대신 결과 표시', () => {
    render(<ApprovalCard item={{ ...perm, resolved: 'cancelled' }} onChoose={() => {}} />);
    expect(screen.queryByRole('button', { name: '승인' })).toBeNull();
    expect(screen.getByText('중단됨')).toBeInTheDocument();
  });
});

describe('Composer', () => {
  const base = { running: false, configOptions: [], onCancel: () => {}, onConfig: () => {} };

  it('Enter 전송, 공백만 있으면 전송 안 함', async () => {
    const onSend = vi.fn();
    render(<Composer {...base} onSend={onSend} />);
    const box = screen.getByLabelText('지시 입력');
    await userEvent.type(box, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(box, '고쳐줘{Enter}');
    expect(onSend).toHaveBeenCalledWith('고쳐줘');
    expect(box).toHaveValue('');
  });

  it('Shift+Enter는 줄바꿈', async () => {
    const onSend = vi.fn();
    render(<Composer {...base} onSend={onSend} />);
    await userEvent.type(screen.getByLabelText('지시 입력'), 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('지시 입력')).toHaveValue('a\nb');
  });

  it('disabled면 Enter와 클릭 모두 전송하지 않음', async () => {
    const onSend = vi.fn();
    render(<Composer {...base} disabled onSend={onSend} />);
    const box = screen.getByLabelText('지시 입력');
    // 세션이 붙기 전에는 입력란도 비활성: 입력해 둔 Enter가 조용히 버려지지 않게 한다.
    expect(box).toBeDisabled();
    await userEvent.type(box, '고쳐줘{Enter}');
    expect(box).toHaveValue('');
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('실행 중에는 중단 버튼', async () => {
    const onCancel = vi.fn();
    render(<Composer {...base} running onSend={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: '중단' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('설정 옵션은 model·thinking_effort·mode만 선택 상자로 표시', async () => {
    const onConfig = vi.fn();
    const opt = (id: string) => ({ id, name: id, currentValue: 'a', options: [{ value: 'a', name: 'A' }, { value: 'b', name: 'B' }] });
    render(
      <Composer {...base} onSend={() => {}} onConfig={onConfig} configOptions={[opt('provider'), opt('model'), opt('mode')]} />
    );
    expect(screen.queryByLabelText('provider')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('mode'), 'b');
    expect(onConfig).toHaveBeenCalledWith('mode', 'b');
  });
});

describe('StatusBadge', () => {
  it.each([
    ['running', '실행 중'],
    ['awaiting_approval', '승인 대기'],
    ['done', '완료'],
    ['error', '오류'],
  ] as const)('%s → %s', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
  it('idle은 표시하지 않음', () => {
    const { container } = render(<StatusBadge status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ThreadView', () => {
  it('항목 종류별로 렌더링', () => {
    render(
      <ThreadView
        title="토큰 수정"
        onChoose={() => {}}
        runtime={{
          status: 'running',
          configOptions: [],
          items: [
            { kind: 'user', id: 'user-0', text: '고쳐줘' },
            { kind: 'agent', id: 'agent-1', text: '원인 확인' },
            { kind: 'tool', id: 'tool-2', toolCallId: 't', title: 'npm test', toolKind: 'execute', status: 'completed', output: '14 passed', files: ['a.ts'] },
            { kind: 'error', id: 'error-3', message: '401' },
          ],
        }}
      />
    );
    expect(screen.getByRole('heading', { name: '토큰 수정' })).toBeInTheDocument();
    expect(screen.getByText('고쳐줘')).toBeInTheDocument();
    expect(screen.getByText('원인 확인')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('401');
  });
});
