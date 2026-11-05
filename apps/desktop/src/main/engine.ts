import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { buildEngineUrls, redact } from './engine-urls';

export type EngineState = 'starting' | 'ready' | 'restarting' | 'failed' | 'stopped';
export interface EngineStatus {
  state: EngineState;
  message?: string;
}

export interface EngineOptions {
  binaryPath: string;
  argsPrefix?: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  maxRestarts?: number;
  backoffBaseMs?: number;
  readinessTimeoutMs?: number;
  log?: (line: string) => void;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class EngineManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private acpUrl: string | null = null;
  private status: EngineStatus = { state: 'stopped' };
  private stopping = false;
  private restarts = 0;
  private readonly maxRestarts: number;
  private readonly backoffBaseMs: number;
  private readonly readinessTimeoutMs: number;

  constructor(private readonly options: EngineOptions) {
    super();
    this.maxRestarts = options.maxRestarts ?? 3;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.readinessTimeoutMs = options.readinessTimeoutMs ?? 20_000;
  }

  getAcpUrl(): string | null {
    return this.acpUrl;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  async start(): Promise<string> {
    this.stopping = false;
    this.restarts = 0;
    return this.launchWithRetry();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.acpUrl = null;
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t']);
      } else {
        child.kill('SIGTERM');
      }
      await Promise.race([exited, sleep(3000)]);
    }
    this.setStatus({ state: 'stopped' });
  }

  private async launchWithRetry(): Promise<string> {
    for (;;) {
      try {
        this.setStatus({ state: 'starting' });
        const url = await this.launchOnce();
        this.restarts = 0;
        this.setStatus({ state: 'ready' });
        return url;
      } catch (error) {
        if (this.stopping) throw error;
        if (this.restarts >= this.maxRestarts) {
          const message = `엔진 시작 실패: ${error instanceof Error ? error.message : String(error)}`;
          this.setStatus({ state: 'failed', message });
          throw new Error(message);
        }
        this.restarts += 1;
        this.setStatus({ state: 'restarting', message: `재시작 ${this.restarts}/${this.maxRestarts}` });
        await sleep(this.backoffBaseMs * 2 ** (this.restarts - 1));
      }
    }
  }

  private async launchOnce(): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    const port = await freePort();
    const { statusUrl, acpUrl } = buildEngineUrls(port, secret);
    const args = [...(this.options.argsPrefix ?? []), 'serve', '--host', '127.0.0.1', '--port', String(port)];
    const child = spawn(this.options.binaryPath, args, {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...this.options.env,
        GOOSE_SERVER__SECRET_KEY: secret,
        GOOSE_DISABLE_TELEMETRY: '1',
      },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    const log = (chunk: Buffer) => this.options.log?.(redact(chunk.toString(), secret).trimEnd());
    child.stdout?.on('data', log);
    child.stderr?.on('data', log);

    let exitCode: number | null = null;
    const exited = new Promise<void>((resolve) =>
      child.once('exit', (code) => {
        exitCode = code;
        resolve();
      })
    );

    const deadline = Date.now() + this.readinessTimeoutMs;
    for (;;) {
      if (exitCode !== null || child.exitCode !== null) throw new Error(`엔진 종료 (exit ${exitCode ?? child.exitCode})`);
      if (Date.now() > deadline) {
        child.kill();
        throw new Error('준비 확인 시간 초과');
      }
      try {
        const res = await fetch(statusUrl);
        if (res.ok) break;
      } catch {
        // 아직 대기 중
      }
      await Promise.race([sleep(100), exited]);
    }

    this.acpUrl = acpUrl;
    void exited.then(() => this.onUnexpectedExit(child));
    return acpUrl;
  }

  private onUnexpectedExit(child: ChildProcess): void {
    if (this.stopping || this.child !== child) return;
    this.acpUrl = null;
    this.child = null;
    this.setStatus({ state: 'restarting', message: '엔진 비정상 종료' });
    void this.launchWithRetry().catch(() => {});
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.emit('status', status);
  }
}
