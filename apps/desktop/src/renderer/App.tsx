import { useEffect, useState } from 'react';
import type { EngineStatusView } from '../shared/artex-api';
import { Composer } from './components/Composer';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { ThreadView } from './components/ThreadView';
import { appStore, bootEngine, controller, ensureThreadSession } from './runtime';
import { useStore } from './state/use-store';

export function App() {
  const state = useStore(appStore, () => appStore.getState());
  useStore(controller, () => controller.getVersion());
  const [engine, setEngine] = useState<EngineStatusView>({ state: 'starting' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  useEffect(() => {
    void appStore.refresh();
    void window.artex.invoke('engine:getStatus').then((s) => setEngine(s as EngineStatusView));
    return window.artex.onEngineStatus(setEngine);
  }, []);

  useEffect(() => {
    if (engine.state === 'ready') void bootEngine().catch((e) => setThreadError(String(e)));
  }, [engine.state]);

  const selected = state.threads.find((t) => t.id === state.selectedThreadId) ?? null;

  useEffect(() => {
    if (selected && engine.state === 'ready') {
      setThreadError(null);
      void ensureThreadSession(selected).catch((e) => setThreadError(e instanceof Error ? e.message : String(e)));
    }
  }, [selected?.id, engine.state]);

  const statusOf = (id: string) => controller.getThread(id).status;
  const runtime = controller.getThread(selected?.id ?? '');
  const running = runtime.status === 'running' || runtime.status === 'awaiting_approval';

  return (
    <div className="flex h-full gap-2.5 p-2.5">
      <Sidebar
        projects={state.projects}
        threads={state.threads}
        statusOf={statusOf}
        selectedId={state.selectedThreadId}
        onSelect={(id) => appStore.selectThread(id)}
        onNewThread={(projectId) => void appStore.createThread(projectId, '새 스레드')}
        onAddProject={() => void appStore.addProject()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] bg-[var(--artex-pane)] shadow-[var(--artex-shadow)]">
        {engine.state !== 'ready' && (
          <div role="status" className="bg-[var(--artex-warn-soft)] px-7 py-2 text-[13px] text-[var(--artex-warn-text)]">
            엔진 {engine.state}
            {engine.message ? ` · ${engine.message}` : ''}
          </div>
        )}
        {(state.error || threadError) && (
          <div role="alert" className="bg-[var(--artex-del-bg)] px-7 py-2 text-[13px] text-[var(--artex-del-text)]">
            {state.error ?? threadError}
          </div>
        )}
        {settingsOpen ? (
          <Settings onClose={() => setSettingsOpen(false)} />
        ) : selected ? (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-6">
              <div className="mx-auto max-w-[800px]">
                <ThreadView title={selected.title} runtime={runtime} onChoose={(rid, c) => controller.respond(selected.id, rid, c)} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-[800px] px-7 pb-5">
              <Composer
                running={running}
                configOptions={runtime.configOptions}
                onSend={(text) => void controller.send(selected.id, text)}
                onCancel={() => void controller.cancel(selected.id)}
                onConfig={(id, value) => void controller.setConfig(selected.id, id, value)}
              />
            </div>
          </>
        ) : (
          <div className="m-auto text-[var(--artex-muted)]">프로젝트 추가 후 새 스레드 시작</div>
        )}
      </main>
    </div>
  );
}
