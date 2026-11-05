import { useEffect, useState } from 'react';
import type { EngineStatusView } from '../shared/artex-api';
import { Composer } from './components/Composer';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { ThreadView } from './components/ThreadView';
import { appStore, connectionStore, controller, ensureThreadSession, getConnection, reconnector } from './runtime';
import { useStore } from './state/use-store';

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ENGINE_LABEL: Record<Exclude<EngineStatusView['state'], 'ready'>, string> = {
  starting: '시작 중',
  restarting: '재시작 중',
  failed: '시작 실패',
  stopped: '중지됨',
};

export function App() {
  const state = useStore(appStore, () => appStore.getState());
  useStore(controller, () => controller.getVersion());
  const connVersion = useStore(connectionStore, () => connectionStore.getVersion());
  const reconnect = useStore(reconnector, () => reconnector.getState());
  const [readyThreadId, setReadyThreadId] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineStatusView>({ state: 'starting' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  useEffect(() => {
    void appStore.refresh();
    void window.artex.invoke('engine:getStatus').then((s) => setEngine(s as EngineStatusView));
    return window.artex.onEngineStatus(setEngine);
  }, []);

  useEffect(() => {
    // 엔진이 ready인 동안 소켓 연결을 유지한다(실패·끊김 시 백오프 재시도).
    reconnector.setReady(engine.state === 'ready');
  }, [engine.state]);

  const selected = state.threads.find((t) => t.id === state.selectedThreadId) ?? null;

  useEffect(() => {
    setReadyThreadId(null);
    if (!selected || !getConnection()) return;
    let cancelled = false;
    setThreadError(null);
    ensureThreadSession(selected).then(
      () => {
        if (!cancelled) setReadyThreadId(selected.id);
      },
      (e) => {
        if (!cancelled) setThreadError(errMessage(e));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [selected?.id, connVersion]);

  const report = (p: Promise<unknown>) => {
    p.catch((e) => setThreadError(errMessage(e)));
  };

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
        onSelect={(id) => {
          setSettingsOpen(false);
          appStore.selectThread(id);
        }}
        onNewThread={(projectId) => {
          setSettingsOpen(false);
          void appStore.createThread(projectId, '새 스레드');
        }}
        onAddProject={() => void appStore.addProject()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] bg-[var(--artex-pane)] shadow-[var(--artex-shadow)]">
        {engine.state !== 'ready' && (
          <div role="status" className="bg-[var(--artex-warn-soft)] px-7 py-2 text-[13px] text-[var(--artex-warn-text)]">
            엔진 {ENGINE_LABEL[engine.state]}
            {engine.message ? ` · ${engine.message}` : ''}
          </div>
        )}
        {engine.state === 'ready' && reconnect.error && !getConnection() && (
          <div role="alert" className="flex items-center gap-3 bg-[var(--artex-warn-soft)] px-7 py-2 text-[13px] text-[var(--artex-warn-text)]">
            <span>엔진 연결 안 됨 · {reconnect.error} · 자동 재연결 중</span>
            <button
              type="button"
              onClick={() => void reconnector.connectNow()}
              className="ml-auto min-h-8 rounded-full bg-[var(--artex-pane)] px-3 font-semibold text-[var(--artex-text)]"
            >
              다시 연결
            </button>
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
                key={selected.id}
                disabled={readyThreadId !== selected.id}
                running={running}
                configOptions={runtime.configOptions}
                onSend={(text) => report(controller.send(selected.id, text))}
                onCancel={() => report(controller.cancel(selected.id))}
                onConfig={(id, value) => report(controller.setConfig(selected.id, id, value))}
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
