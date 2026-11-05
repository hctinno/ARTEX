import type { TimelineItem } from '@artex/core';

const STATUS: Record<string, string> = { pending: '대기', in_progress: '실행 중', completed: '완료', failed: '실패' };

export function ToolCallCard({ item }: { item: Extract<TimelineItem, { kind: 'tool' }> }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-[var(--artex-card)]">
      <div className="flex min-h-11 items-center gap-2.5 px-4">
        <span className="font-[family-name:var(--artex-mono)] text-[13px]">{item.title}</span>
        <span className="ml-auto rounded-full bg-[var(--artex-fill)] px-2.5 py-0.5 text-xs font-semibold">{STATUS[item.status] ?? item.status}</span>
      </div>
      {item.output && (
        <pre className="m-0 px-4 pb-3.5 font-[family-name:var(--artex-mono)] text-[12.5px] whitespace-pre-wrap text-[var(--artex-muted)]">{item.output}</pre>
      )}
      {item.files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3.5">
          {item.files.map((f) => (
            <span key={f} className="rounded-full bg-[var(--artex-fill)] px-3 py-1.5 font-[family-name:var(--artex-mono)] text-xs">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}
