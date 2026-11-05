import type { ContentLike, KnownUpdate, PlanEntryLike, ToolContentLike, ToolStatus } from './acp-types';

export type PermissionChoice = 'allow_once' | 'allow_always' | 'reject';

export type TimelineItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | {
      kind: 'tool';
      id: string;
      toolCallId: string;
      title: string;
      toolKind: string;
      status: ToolStatus;
      output: string;
      files: string[];
    }
  | { kind: 'plan'; id: string; entries: PlanEntryLike[] }
  | {
      kind: 'permission';
      id: string;
      requestId: string;
      title: string;
      detail: string;
      available: PermissionChoice[];
      resolved: PermissionChoice | 'cancelled' | null;
    }
  | { kind: 'error'; id: string; message: string };

function textOf(content: ContentLike): string | null {
  return content.type === 'text' && typeof (content as { text?: unknown }).text === 'string'
    ? (content as { text: string }).text
    : null;
}

function appendText(
  items: readonly TimelineItem[],
  kind: 'user' | 'agent' | 'thought',
  chunk: string
): TimelineItem[] {
  const last = items[items.length - 1];
  if (last && last.kind === kind) {
    return [...items.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...items, { kind, id: `${kind}-${items.length}`, text: chunk }];
}

function mergeToolContent(output: string, files: string[], content: ToolContentLike[] | null | undefined) {
  let nextOutput = output;
  const nextFiles = [...files];
  for (const c of content ?? []) {
    if (c.type === 'content') {
      const t = textOf(c.content);
      if (t) nextOutput = nextOutput ? `${nextOutput}\n${t}` : t;
    } else if (c.type === 'diff' && !nextFiles.includes(c.path)) {
      nextFiles.push(c.path);
    }
  }
  return { output: nextOutput, files: nextFiles };
}

export function appendUserText(items: readonly TimelineItem[], text: string): TimelineItem[] {
  return [...items, { kind: 'user', id: `user-${items.length}`, text }];
}

export function applyUpdate(items: readonly TimelineItem[], update: KnownUpdate): TimelineItem[] {
  switch (update.sessionUpdate) {
    case 'user_message_chunk':
    case 'agent_message_chunk':
    case 'agent_thought_chunk': {
      const chunk = textOf(update.content);
      if (chunk === null) return [...items];
      const kind =
        update.sessionUpdate === 'user_message_chunk'
          ? 'user'
          : update.sessionUpdate === 'agent_message_chunk'
            ? 'agent'
            : 'thought';
      return appendText(items, kind, chunk);
    }
    case 'tool_call': {
      const merged = mergeToolContent('', [], update.content);
      return [
        ...items,
        {
          kind: 'tool',
          id: `tool-${items.length}`,
          toolCallId: update.toolCallId,
          title: update.title,
          toolKind: update.kind ?? 'other',
          status: update.status ?? 'pending',
          ...merged,
        },
      ];
    }
    case 'tool_call_update': {
      const index = items.findIndex((i) => i.kind === 'tool' && i.toolCallId === update.toolCallId);
      if (index === -1) {
        const merged = mergeToolContent('', [], update.content);
        return [
          ...items,
          {
            kind: 'tool',
            id: `tool-${items.length}`,
            toolCallId: update.toolCallId,
            title: update.title ?? '도구 실행',
            toolKind: 'other',
            status: update.status ?? 'pending',
            ...merged,
          },
        ];
      }
      const current = items[index] as Extract<TimelineItem, { kind: 'tool' }>;
      const merged = mergeToolContent(current.output, current.files, update.content);
      const next = {
        ...current,
        title: update.title ?? current.title,
        status: update.status ?? current.status,
        ...merged,
      };
      return [...items.slice(0, index), next, ...items.slice(index + 1)];
    }
    case 'plan': {
      const index = items.findIndex((i) => i.kind === 'plan');
      const entries = update.entries.map((e) => ({ ...e }));
      if (index === -1) return [...items, { kind: 'plan', id: `plan-${items.length}`, entries }];
      const current = items[index] as Extract<TimelineItem, { kind: 'plan' }>;
      return [...items.slice(0, index), { ...current, entries }, ...items.slice(index + 1)];
    }
  }
}
