import type { PermissionOptionLike } from './acp-types';
import type { PermissionChoice } from './timeline';

const KINDS: Record<PermissionChoice, string[]> = {
  allow_once: ['allow_once'],
  allow_always: ['allow_always'],
  reject: ['reject_once', 'reject_always'],
};

export function pickOptionId(options: PermissionOptionLike[], choice: PermissionChoice): string | null {
  for (const kind of KINDS[choice]) {
    const found = options.find((o) => o.kind === kind);
    if (found) return found.optionId;
  }
  return null;
}

export function availableChoices(options: PermissionOptionLike[]): PermissionChoice[] {
  return (Object.keys(KINDS) as PermissionChoice[]).filter((c) => pickOptionId(options, c) !== null);
}
