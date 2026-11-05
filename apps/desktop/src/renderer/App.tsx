import { useEffect, useState } from 'react';
import type { EngineStatusView } from '../shared/artex-api';

export function App() {
  const [status, setStatus] = useState<EngineStatusView>({ state: 'starting' });
  useEffect(() => {
    void window.artex.invoke('engine:getStatus').then((s) => setStatus(s as EngineStatusView));
    return window.artex.onEngineStatus(setStatus);
  }, []);
  return <div data-testid="engine-status">엔진 상태: {status.state}</div>;
}
