export type ThreadStatus = 'idle' | 'running' | 'awaiting_approval' | 'done' | 'error';

export type StatusEvent =
  | { type: 'prompt_started' }
  | { type: 'permission_requested' }
  | { type: 'permission_resolved' }
  | { type: 'prompt_finished'; stopReason: string }
  | { type: 'failed' };

export function nextStatus(current: ThreadStatus, event: StatusEvent): ThreadStatus {
  switch (event.type) {
    case 'prompt_started':
      return 'running';
    case 'permission_requested':
      return current === 'running' ? 'awaiting_approval' : current;
    case 'permission_resolved':
      return current === 'awaiting_approval' ? 'running' : current;
    case 'prompt_finished':
      if (current !== 'running' && current !== 'awaiting_approval') return current;
      return event.stopReason === 'cancelled' ? 'idle' : 'done';
    case 'failed':
      return 'error';
  }
}
