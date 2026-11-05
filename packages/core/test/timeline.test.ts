import { describe, expect, it } from 'vitest';
import { applyUpdate, appendUserText, isKnownUpdate, type TimelineItem } from '../src/index';

const text = (t: string) => ({ type: 'text' as const, text: t });

describe('applyUpdate', () => {
  it('연속 agent 조각은 하나로 합친다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('안') });
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('녕') });
    expect(items).toEqual([{ kind: 'agent', id: 'agent-0', text: '안녕' }]);
  });

  it('도구 호출 사이의 agent 조각은 새 항목', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('A') });
    items = applyUpdate(items, { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'shell' });
    items = applyUpdate(items, { sessionUpdate: 'agent_message_chunk', content: text('B') });
    expect(items.map((i) => i.kind)).toEqual(['agent', 'tool', 'agent']);
  });

  it('tool_call_update는 같은 toolCallId 항목을 갱신하고 출력·파일을 누적한다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, {
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'npm test',
      kind: 'execute',
      status: 'pending',
    });
    items = applyUpdate(items, {
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      content: [
        { type: 'content', content: text('14 passed') },
        { type: 'diff', path: 'src/a.ts', newText: 'x' },
      ],
    });
    expect(items[0]).toMatchObject({
      kind: 'tool',
      toolCallId: 't1',
      title: 'npm test',
      toolKind: 'execute',
      status: 'completed',
      output: '14 passed',
      files: ['src/a.ts'],
    });
  });

  it('없는 toolCallId 업데이트는 새 도구 항목을 만든다', () => {
    const items = applyUpdate([], { sessionUpdate: 'tool_call_update', toolCallId: 'x', status: 'failed' });
    expect(items[0]).toMatchObject({ kind: 'tool', toolCallId: 'x', status: 'failed', title: '도구 실행' });
  });

  it('같은 파일은 한 번만 기록한다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'tool_call', toolCallId: 't', title: 'edit' });
    const diff = { type: 'diff' as const, path: 'a.ts', newText: '' };
    items = applyUpdate(items, { sessionUpdate: 'tool_call_update', toolCallId: 't', content: [diff] });
    items = applyUpdate(items, { sessionUpdate: 'tool_call_update', toolCallId: 't', content: [diff] });
    expect(items[0]).toMatchObject({ files: ['a.ts'] });
  });

  it('plan은 기존 plan 항목을 교체한다', () => {
    let items: TimelineItem[] = [];
    items = applyUpdate(items, { sessionUpdate: 'plan', entries: [{ content: 'a', status: 'pending' }] });
    items = applyUpdate(items, { sessionUpdate: 'plan', entries: [{ content: 'a', status: 'completed' }] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'plan', entries: [{ content: 'a', status: 'completed' }] });
  });

  it('text가 아닌 content 조각은 무시한다', () => {
    const items = applyUpdate([], { sessionUpdate: 'agent_message_chunk', content: { type: 'image', data: 'x' } });
    expect(items).toEqual([]);
  });

  it('입력 배열을 변경하지 않는다', () => {
    const before: TimelineItem[] = [{ kind: 'agent', id: 'agent-0', text: 'a' }];
    const frozen = Object.freeze([...before]);
    applyUpdate(frozen, { sessionUpdate: 'agent_message_chunk', content: text('b') });
    expect(before[0]).toEqual({ kind: 'agent', id: 'agent-0', text: 'a' });
  });
});

describe('appendUserText', () => {
  it('사용자 항목을 추가한다', () => {
    expect(appendUserText([], '고쳐줘')).toEqual([{ kind: 'user', id: 'user-0', text: '고쳐줘' }]);
  });
});

describe('isKnownUpdate', () => {
  it('알려진 종류만 통과', () => {
    expect(isKnownUpdate({ sessionUpdate: 'plan', entries: [] })).toBe(true);
    expect(isKnownUpdate({ sessionUpdate: 'usage_update' })).toBe(false);
    expect(isKnownUpdate(null)).toBe(false);
  });
});
