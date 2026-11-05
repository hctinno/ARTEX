import { describe, expect, it } from 'vitest';
import { nextStatus, type ThreadStatus } from '../src/index';

describe('nextStatus', () => {
  it.each<ThreadStatus>(['idle', 'done', 'error'])('%s → prompt_started → running', (s) => {
    expect(nextStatus(s, { type: 'prompt_started' })).toBe('running');
  });
  it('running 중 prompt_started는 무시', () => {
    expect(nextStatus('running', { type: 'prompt_started' })).toBe('running');
  });
  it('running → permission_requested → awaiting_approval', () => {
    expect(nextStatus('running', { type: 'permission_requested' })).toBe('awaiting_approval');
  });
  it('awaiting_approval → permission_resolved → running', () => {
    expect(nextStatus('awaiting_approval', { type: 'permission_resolved' })).toBe('running');
  });
  it.each(['end_turn', 'max_tokens', 'max_turn_requests', 'refusal'])(
    'running → prompt_finished(%s) → done',
    (stopReason) => {
      expect(nextStatus('running', { type: 'prompt_finished', stopReason })).toBe('done');
    }
  );
  it('cancelled 종료는 idle', () => {
    expect(nextStatus('awaiting_approval', { type: 'prompt_finished', stopReason: 'cancelled' })).toBe('idle');
  });
  it.each<ThreadStatus>(['idle', 'running', 'awaiting_approval', 'done'])('%s → failed → error', (s) => {
    expect(nextStatus(s, { type: 'failed' })).toBe('error');
  });
  it('idle에서 permission_resolved는 상태 유지', () => {
    expect(nextStatus('idle', { type: 'permission_resolved' })).toBe('idle');
  });
});
