export interface ConfigOptionView {
  id: string;
  name: string;
  currentValue: string;
  options: { value: string; name: string }[];
}

export const COMPOSER_CONFIG_IDS = ['model', 'thinking_effort', 'mode'] as const;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null;

function flatten(options: unknown): { value: string; name: string }[] {
  if (!Array.isArray(options)) return [];
  const out: { value: string; name: string }[] = [];
  for (const o of options) {
    if (!isObj(o)) continue;
    if (Array.isArray(o.options)) {
      out.push(...flatten(o.options));
    } else if (typeof o.value === 'string' && typeof o.name === 'string') {
      out.push({ value: o.value, name: o.name });
    }
  }
  return out;
}

export function normalizeConfigOptions(raw: unknown): ConfigOptionView[] {
  if (!Array.isArray(raw)) return [];
  const out: ConfigOptionView[] = [];
  for (const item of raw) {
    if (!isObj(item) || item.type !== 'select') continue;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.currentValue !== 'string') continue;
    out.push({ id: item.id, name: item.name, currentValue: item.currentValue, options: flatten(item.options) });
  }
  return out;
}
