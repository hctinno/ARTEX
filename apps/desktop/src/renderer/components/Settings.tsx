import { useEffect, useState } from 'react';
import type { GooseExtClient } from '@aaif/goose-acp-client';
import { getConnection } from '../runtime';
import { buildConfigFields, visibleProviders, type ProviderEntryView } from '../settings/provider-form';

type ProviderApi = Pick<
  GooseExtClient,
  'providersList_unstable' | 'providersConfigSave_unstable' | 'defaultsSave_unstable'
>;

export function Settings({ onClose, api }: { onClose(): void; api?: ProviderApi | null }) {
  const client: ProviderApi | null = api === undefined ? (getConnection()?.goose ?? null) : api;
  const [providers, setProviders] = useState<ProviderEntryView[]>([]);
  const [selected, setSelected] = useState<ProviderEntryView | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [model, setModel] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setSelected(null);
    if (!client) return;
    let cancelled = false;
    void client
      .providersList_unstable({})
      .then((r) => {
        if (!cancelled) setProviders(visibleProviders(r.entries));
      })
      .catch((e: unknown) => {
        if (!cancelled) setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!client) {
    return (
      <div className="p-7">
        <div className="text-[var(--artex-muted)]">엔진 연결 후 설정 가능</div>
        <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-full bg-[var(--artex-fill)] px-4">
          닫기
        </button>
      </div>
    );
  }

  const choose = (p: ProviderEntryView) => {
    setSelected(p);
    setValues({});
    setModel(p.models.some((m) => m.id === p.defaultModel) ? p.defaultModel : (p.models[0]?.id ?? ''));
    setMessage(null);
  };

  const save = async () => {
    if (!selected) return;
    const { fields, missing } = buildConfigFields(selected.configKeys, values, selected.configured);
    if (missing.length) {
      setMessage({ tone: 'error', text: `필수 입력 누락: ${missing.join(', ')}` });
      return;
    }
    try {
      if (fields.length) await client.providersConfigSave_unstable({ providerId: selected.providerId, fields });
      await client.defaultsSave_unstable({ providerId: selected.providerId, modelId: model || null });
      setValues({});
      setMessage({ tone: 'ok', text: '저장 완료' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="flex items-center">
        <h1 className="m-0 text-[28px] font-bold">설정 · 모델 프로바이더</h1>
        <button type="button" onClick={onClose} className="ml-auto min-h-11 rounded-full bg-[var(--artex-fill)] px-4">
          닫기
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <button
            key={p.providerId}
            type="button"
            onClick={() => choose(p)}
            aria-pressed={selected?.providerId === p.providerId}
            className={`min-h-11 rounded-full px-4 ${selected?.providerId === p.providerId ? 'bg-[var(--artex-accent)] text-white' : 'bg-[var(--artex-fill)]'}`}
          >
            {p.providerName}
            {p.configured && <span className="ml-2 text-[12px] opacity-80">설정됨</span>}
          </button>
        ))}
      </div>
      {selected && (
        <form
          className="flex max-w-[520px] flex-col gap-3 rounded-[18px] bg-[var(--artex-card)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {selected.configKeys.map((k) => (
            <label key={k.name} className="flex flex-col gap-1 text-[13px]">
              <span>
                {k.name}
                {k.required ? ' (필수)' : ''}
              </span>
              <input
                aria-label={k.name}
                type={k.secret ? 'password' : 'text'}
                placeholder={selected.configured && k.secret ? '저장된 값 유지' : (k.default ?? '')}
                value={values[k.name] ?? ''}
                onChange={(e) => setValues({ ...values, [k.name]: e.target.value })}
                className="min-h-11 rounded-[14px] bg-[var(--artex-pane)] px-3.5"
              />
            </label>
          ))}
          {selected.models.length > 0 && (
            <label className="flex flex-col gap-1 text-[13px]">
              <span>기본 모델</span>
              <select
                aria-label="기본 모델"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="min-h-11 rounded-[14px] bg-[var(--artex-pane)] px-3.5"
              >
                {selected.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="min-h-11 rounded-full bg-[var(--artex-accent)] font-semibold text-white">
            저장
          </button>
        </form>
      )}
      {message &&
        (message.tone === 'error' ? (
          <div role="alert" className="text-[var(--artex-del-text)]">
            {message.text}
          </div>
        ) : (
          <div role="status">{message.text}</div>
        ))}
    </div>
  );
}
