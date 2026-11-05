import type { ThreadStatus } from '@artex/core';

const LABEL: Record<Exclude<ThreadStatus, 'idle'>, string> = {
  running: '실행 중',
  awaiting_approval: '승인 대기',
  done: '완료',
  error: '오류',
};

export function StatusBadge({ status }: { status: ThreadStatus }) {
  if (status === 'idle') return null;
  const tone =
    status === 'awaiting_approval'
      ? 'bg-[var(--artex-warn-soft)] text-[var(--artex-warn-text)]'
      : status === 'error'
        ? 'bg-[var(--artex-del-bg)] text-[var(--artex-del-text)]'
        : 'bg-[var(--artex-fill)] text-[var(--artex-muted)]';
  return <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${tone}`}>{LABEL[status]}</span>;
}
