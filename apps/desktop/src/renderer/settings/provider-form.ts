export interface ProviderEntryView {
  providerId: string;
  providerName: string;
  configured: boolean;
  defaultModel: string;
  configKeys: { name: string; required: boolean; secret: boolean; default?: string | null }[];
  models: { id: string; name: string }[];
}

type RawProviderEntry = ProviderEntryView & { visibleInSetup: boolean; deprecated: boolean };

/** 설정 화면에 보여줄 프로바이더만 골라 이름순으로 정렬한다. */
export function visibleProviders(entries: unknown[]): ProviderEntryView[] {
  return (entries as RawProviderEntry[])
    .filter((e) => e.visibleInSetup && !e.deprecated)
    .map(({ providerId, providerName, configured, defaultModel, configKeys, models }) => ({
      providerId,
      providerName,
      configured,
      defaultModel,
      configKeys,
      models,
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}

/** 입력된(공백 제외) 값만 전송 대상으로 모으고, 비어 있는 필수 키는 missing으로 보고한다. */
export function buildConfigFields(
  keys: ProviderEntryView['configKeys'],
  values: Record<string, string>,
  configured = false,
) {
  const fields: { key: string; value: string }[] = [];
  const missing: string[] = [];
  for (const k of keys) {
    const value = (values[k.name] ?? '').trim();
    if (value) fields.push({ key: k.name, value });
    // 이미 설정된 프로바이더는 빈 필수 키가 저장된 값을 유지하므로 누락으로 보지 않는다.
    else if (k.required && !configured) missing.push(k.name);
  }
  return { fields, missing };
}
