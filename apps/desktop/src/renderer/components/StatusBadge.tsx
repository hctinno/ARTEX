import type { ThreadStatus } from '@artex/core';

const LABEL: Record<Exclude<ThreadStatus, 'idle'>, string> = {
  running: '실행 중',
  awaiting_approval: '승인 대기',
  done: '완료',
  error: '오류',
};

/** selected: 강조색 배경(선택된 사이드바 행) 위에 놓일 때 쓰는 고대비 톤. */
export function StatusBadge({ status, selected = false }: { status: ThreadStatus; selected?: boolean }) {
  if (status === 'idle') return null;
  const tone = selected
    ? status === 'awaiting_approval'
      ? 'bg-[var(--artex-sel-solid-bg)] text-[var(--artex-sel-warn-text)]'
      : status === 'error'
        ? 'bg-[var(--artex-sel-solid-bg)] text-[var(--artex-sel-del-text)]'
        : 'bg-[var(--artex-sel-badge-bg)] text-[var(--artex-sel-badge-text)]'
    : status === 'awaiting_approval'
      ? 'bg-[var(--artex-warn-soft)] text-[var(--artex-warn-text)]'
      : status === 'error'
        ? 'bg-[var(--artex-del-bg)] text-[var(--artex-del-text)]'
        : 'bg-[var(--artex-fill)] text-[var(--artex-muted)]';
  return (
    <span
      data-testid="status-badge"
      data-selected={selected ? 'true' : undefined}
      className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${tone}`}
    >
      {LABEL[status]}
    </span>
  );
}
