import type { PermissionChoice, TimelineItem } from '@artex/core';

const BUTTONS: { choice: PermissionChoice; label: string; primary: boolean }[] = [
  { choice: 'reject', label: '거부', primary: false },
  { choice: 'allow_always', label: '이 세션 동안 허용', primary: false },
  { choice: 'allow_once', label: '승인', primary: true },
];

const RESOLVED: Record<PermissionChoice | 'cancelled', string> = {
  allow_once: '승인됨',
  allow_always: '이 세션 동안 허용됨',
  reject: '거부됨',
  cancelled: '중단됨',
};

export function ApprovalCard({
  item,
  onChoose,
}: {
  item: Extract<TimelineItem, { kind: 'permission' }>;
  onChoose(choice: PermissionChoice): void;
}) {
  return (
    <div role="group" aria-label="승인 요청" className="flex flex-col items-center gap-3 rounded-[22px] bg-[var(--artex-pane)] p-5 text-center shadow-[var(--artex-shadow)]">
      <span className="text-base font-bold">{item.title}</span>
      {item.detail && (
        <code className="rounded-xl bg-[var(--artex-card)] px-3.5 py-2 font-[family-name:var(--artex-mono)] text-[13px]">{item.detail}</code>
      )}
      {item.resolved ? (
        <span className="text-[13px] text-[var(--artex-muted)]">{RESOLVED[item.resolved]}</span>
      ) : (
        <div className="flex w-full flex-wrap justify-center gap-2">
          {BUTTONS.map((b) => (
            <button
              key={b.choice}
              type="button"
              disabled={!item.available.includes(b.choice)}
              onClick={() => onChoose(b.choice)}
              className={`min-h-11 flex-1 basis-32 rounded-full text-sm disabled:opacity-40 ${
                b.primary ? 'bg-[var(--artex-accent)] font-semibold text-white' : 'bg-[var(--artex-fill)]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
