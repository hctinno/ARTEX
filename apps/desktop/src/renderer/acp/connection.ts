import { client, methods, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { createWebSocketStream } from '@agentclientprotocol/sdk/experimental/ws-client';
import { GooseExtClient } from '@aaif/goose-acp-client';
import type { AgentPort, PermissionRequestLike, PermissionResponseLike } from '@artex/core';

export interface EngineConnection extends AgentPort {
  goose: GooseExtClient;
  close(): void;
}

export interface EngineHandlers {
  onUpdate(notification: { sessionId: string; update: unknown }): void;
  onPermission(request: PermissionRequestLike): Promise<PermissionResponseLike>;
  onClose(): void;
}

const INITIALIZE_TIMEOUT_MS = 10_000;

export async function connectEngine(url: string, handlers: EngineHandlers): Promise<EngineConnection> {
  const stream = createWebSocketStream(url, { protocols: [] });
  const app = client({ name: 'artex' })
    .onRequest(methods.client.session.requestPermission, (ctx) =>
      handlers.onPermission(ctx.params)
    )
    .onNotification(methods.client.session.update, (ctx) =>
      handlers.onUpdate(ctx.params)
    );
  const connection = app.connect(stream);
  const agent = connection.agent;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('엔진 초기화 시간 초과')), INITIALIZE_TIMEOUT_MS)
  );
  await Promise.race([
    agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: 'artex', version: '0.1.0' },
    }),
    timeout,
  ]);
  void connection.closed.then(handlers.onClose, handlers.onClose);

  return {
    goose: new GooseExtClient(agent),
    close: () => connection.close(),
    async newSession(cwd) {
      const res = (await agent.request(methods.agent.session.new, { cwd, mcpServers: [] }));
      return { sessionId: String(res.sessionId), configOptions: res.configOptions };
    },
    async loadSession(sessionId, cwd) {
      const res = (await agent.request(methods.agent.session.load, { sessionId, cwd, mcpServers: [] }));
      return { configOptions: res?.configOptions };
    },
    async prompt(sessionId, text) {
      const res = (await agent.request(methods.agent.session.prompt, {
        sessionId,
        prompt: [{ type: 'text', text }],
      }));
      return { stopReason: res.stopReason };
    },
    async cancel(sessionId) {
      await agent.notify(methods.agent.session.cancel, { sessionId });
    },
    async setConfigOption(sessionId, configId, value) {
      const res = (await agent.request(methods.agent.session.setConfigOption, { sessionId, configId, value }));
      return { configOptions: res?.configOptions };
    },
  };
}
