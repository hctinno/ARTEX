import type { PermissionChoice, ThreadRuntime } from '@artex/core';
import { ApprovalCard } from './ApprovalCard';
import { ToolCallCard } from './ToolCallCard';

export function ThreadView({
  title,
  runtime,
  onChoose,
}: {
  title: string;
  runtime: ThreadRuntime;
  onChoose(requestId: string, choice: PermissionChoice): void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
      {runtime.items.map((item) => {
        switch (item.kind) {
          case 'user':
            return (
              <div key={item.id} className="max-w-[76%] self-end rounded-[22px_22px_6px_22px] bg-[var(--artex-accent)] px-4 py-2.5 whitespace-pre-wrap text-white">
                {item.text}
              </div>
            );
          case 'agent':
            return (
              <p key={item.id} className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">
                {item.text}
              </p>
            );
          case 'thought':
            return (
              <details key={item.id} className="text-[13px] text-[var(--artex-muted)]">
                <summary>사고 과정</summary>
                <p className="whitespace-pre-wrap">{item.text}</p>
              </details>
            );
          case 'tool':
            return <ToolCallCard key={item.id} item={item} />;
          case 'plan':
            return (
              <ol key={item.id} className="m-0 rounded-[18px] bg-[var(--artex-card)] py-3 pr-4 pl-8 text-[13.5px]">
                {item.entries.map((e, i) => (
                  <li key={i} className={e.status === 'completed' ? 'text-[var(--artex-muted)] line-through' : ''}>
                    {e.content}
                  </li>
                ))}
              </ol>
            );
          case 'permission':
            return <ApprovalCard key={item.id} item={item} onChoose={(c) => onChoose(item.requestId, c)} />;
          case 'error':
            return (
              <div key={item.id} role="alert" className="rounded-[18px] bg-[var(--artex-del-bg)] px-4 py-3 text-[var(--artex-del-text)]">
                {item.message}
              </div>
            );
        }
      })}
    </div>
  );
}
