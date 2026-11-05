export function buildEngineUrls(port: number, token: string) {
  const httpBase = `http://127.0.0.1:${port}`;
  const acp = new URL(`${httpBase}/acp`);
  acp.protocol = 'ws:';
  acp.searchParams.set('token', token);
  return { httpBase, statusUrl: `${httpBase}/status`, acpUrl: acp.toString() };
}

export function redact(text: string, secret: string): string {
  if (!secret) return text;
  return [secret, encodeURIComponent(secret)].reduce((acc, s) => acc.split(s).join('REDACTED'), text);
}
