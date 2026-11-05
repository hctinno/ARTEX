export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ContentLike = { type: 'text'; text: string } | { type: string; [key: string]: unknown };

export type ToolContentLike =
  | { type: 'content'; content: ContentLike }
  | { type: 'diff'; path: string; oldText?: string | null; newText: string }
  | { type: 'terminal'; terminalId: string };

export interface PlanEntryLike {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: string;
}

export type KnownUpdate =
  | { sessionUpdate: 'user_message_chunk'; content: ContentLike }
  | { sessionUpdate: 'agent_message_chunk'; content: ContentLike }
  | { sessionUpdate: 'agent_thought_chunk'; content: ContentLike }
  | {
      sessionUpdate: 'tool_call';
      toolCallId: string;
      title: string;
      kind?: string;
      status?: ToolStatus;
      content?: ToolContentLike[];
    }
  | {
      sessionUpdate: 'tool_call_update';
      toolCallId: string;
      title?: string | null;
      status?: ToolStatus | null;
      content?: ToolContentLike[] | null;
    }
  | { sessionUpdate: 'plan'; entries: PlanEntryLike[] };

const KNOWN = new Set([
  'user_message_chunk',
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
]);

export function isKnownUpdate(u: unknown): u is KnownUpdate {
  return (
    typeof u === 'object' &&
    u !== null &&
    typeof (u as { sessionUpdate?: unknown }).sessionUpdate === 'string' &&
    KNOWN.has((u as { sessionUpdate: string }).sessionUpdate)
  );
}

export interface PermissionOptionLike {
  optionId: string;
  name: string;
  kind: string;
}

export interface PermissionRequestLike {
  sessionId: string;
  toolCall: { toolCallId: string; title?: string | null; rawInput?: unknown };
  options: PermissionOptionLike[];
}

export type PermissionResponseLike = {
  outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' };
};
