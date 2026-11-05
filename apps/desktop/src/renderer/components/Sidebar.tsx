import type { ProjectRecord, ThreadRecord, ThreadStatus } from '@artex/core';
import { StatusBadge } from './StatusBadge';

export function Sidebar({
  projects,
  threads,
  statusOf,
  selectedId,
  onSelect,
  onNewThread,
  onAddProject,
  onOpenSettings,
}: {
  projects: ProjectRecord[];
  threads: ThreadRecord[];
  statusOf(threadId: string): ThreadStatus;
  selectedId: string | null;
  onSelect(id: string): void;
  onNewThread(projectId: string): void;
  onAddProject(): void;
  onOpenSettings(): void;
}) {
  return (
    <nav aria-label="프로젝트와 스레드" className="flex w-[260px] shrink-0 flex-col gap-3.5 rounded-[24px] bg-[var(--artex-pane)] px-3 pt-[18px] pb-3 shadow-[var(--artex-shadow)]">
      <div className="flex items-center gap-2.5 px-1.5">
        <div aria-hidden className="flex size-8 items-center justify-center rounded-[10px] bg-[var(--artex-accent)] font-bold text-white">A</div>
        <span className="text-[17px] font-bold">ARTEX</span>
      </div>
      <button type="button" onClick={onAddProject} className="min-h-11 rounded-xl bg-[var(--artex-fill)] px-2.5 text-left font-semibold">
        프로젝트 추가
      </button>
      {projects.map((p) => (
        <section key={p.id} className="flex flex-col gap-1.5">
          <div className="flex items-center px-2.5">
            <span className="text-[13px] font-semibold text-[var(--artex-muted)]">{p.name}</span>
            <button type="button" aria-label={`${p.name} 새 스레드`} onClick={() => onNewThread(p.id)} className="ml-auto size-11 rounded-full">
              +
            </button>
          </div>
          <ul className="m-0 flex list-none flex-col rounded-2xl bg-[var(--artex-card)] p-1">
            {threads
              .filter((t) => t.projectId === p.id)
              .map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-current={t.id === selectedId ? 'true' : undefined}
                    onClick={() => onSelect(t.id)}
                    className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left ${
                      t.id === selectedId ? 'bg-[var(--artex-accent)] text-white' : ''
                    }`}
                  >
                    <span className="min-w-0 truncate">{t.title}</span>
                    <span className="ml-auto">
                      <StatusBadge status={statusOf(t.id)} />
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <button type="button" onClick={onOpenSettings} className="mt-auto min-h-11 rounded-full bg-[var(--artex-fill)] px-4">
        설정
      </button>
    </nav>
  );
}
