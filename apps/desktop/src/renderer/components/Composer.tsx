import { useState, type KeyboardEvent } from 'react';
import { COMPOSER_CONFIG_IDS, type ConfigOptionView } from '@artex/core';

export function Composer({
  running,
  configOptions,
  onSend,
  onCancel,
  onConfig,
}: {
  running: boolean;
  configOptions: ConfigOptionView[];
  onSend(text: string): void;
  onCancel(): void;
  onConfig(id: string, value: string): void;
}) {
  const [text, setText] = useState('');
  const visible = configOptions.filter((o) => (COMPOSER_CONFIG_IDS as readonly string[]).includes(o.id));

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-[28px] bg-[var(--artex-pane)] py-3.5 pr-3.5 pl-[18px] shadow-[var(--artex-shadow)]">
      <textarea
        aria-label="지시 입력"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="후속 지시 입력"
        className="w-full resize-none bg-transparent text-[15px] outline-none"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((o) => (
          <label key={o.id} className="contents">
            <span className="sr-only">{o.id}</span>
            <select
              aria-label={o.id}
              value={o.currentValue}
              onChange={(e) => onConfig(o.id, e.target.value)}
              className="min-h-9 rounded-full bg-[var(--artex-fill)] px-3.5 text-[13px]"
            >
              {o.options.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        {running ? (
          <button type="button" onClick={onCancel} className="ml-auto min-h-10 rounded-full bg-[var(--artex-fill)] px-4 text-sm font-semibold">
            중단
          </button>
        ) : (
          <button type="button" aria-label="보내기" onClick={submit} className="ml-auto size-10 rounded-full bg-[var(--artex-accent)] text-white">
            ↑
          </button>
        )}
      </div>
    </div>
  );
}
