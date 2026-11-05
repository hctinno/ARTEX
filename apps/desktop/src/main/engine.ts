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
  stableMs?: number;
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

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/** 자식 프로세스를 종료한다. Windows는 taskkill /f /t, 그 외는 SIGTERM 후 2초 뒤 SIGKILL. */
async function killChild(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
    killer.on('error', () => {});
  } else {
    child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (!hasExited(child)) child.kill('SIGKILL');
    }, 2000);
    void exited.then(() => clearTimeout(timer));
  }
  await Promise.race([exited, sleep(3000)]);
}

export class EngineManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private acpUrl: string | null = null;
  private status: EngineStatus = { state: 'stopped' };
  private generation = 0;
  private restarts = 0;
  private stableTimer: NodeJS.Timeout | null = null;
  private readonly maxRestarts: number;
  private readonly backoffBaseMs: number;
  private readonly readinessTimeoutMs: number;
  private readonly stableMs: number;

  constructor(private readonly options: EngineOptions) {
    super();
    this.maxRestarts = options.maxRestarts ?? 3;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.readinessTimeoutMs = options.readinessTimeoutMs ?? 20_000;
    this.stableMs = options.stableMs ?? 30_000;
  }

  getAcpUrl(): string | null {
    return this.acpUrl;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  async start(): Promise<string> {
    const gen = ++this.generation;
    this.restarts = 0;
    return this.launchWithRetry(gen);
  }

  async stop(): Promise<void> {
    this.generation += 1;
    this.clearStableTimer();
    this.acpUrl = null;
    const child = this.child;
    this.child = null;
    if (child) await killChild(child);
    this.setStatus({ state: 'stopped' });
  }

  private cancelled(gen: number): boolean {
    return gen !== this.generation;
  }

  private clearStableTimer(): void {
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
  }

  /** 실패를 재시작 횟수에 반영하고 백오프한다. 상한을 넘으면 failed로 던진다. */
  private async backoffOrFail(gen: number, error: unknown): Promise<void> {
    if (this.cancelled(gen)) throw error;
    if (this.restarts >= this.maxRestarts) {
      const message = `엔진 시작 실패: ${error instanceof Error ? error.message : String(error)}`;
      this.setStatus({ state: 'failed', message });
      throw new Error(message);
    }
    this.restarts += 1;
    this.setStatus({ state: 'restarting', message: `재시작 ${this.restarts}/${this.maxRestarts}` });
    await sleep(this.backoffBaseMs * 2 ** (this.restarts - 1));
    if (this.cancelled(gen)) throw error;
  }

  private async launchWithRetry(gen: number): Promise<string> {
    for (;;) {
      try {
        if (this.cancelled(gen)) throw new Error('엔진 시작 취소');
        this.setStatus({ state: 'starting' });
        const url = await this.launchOnce(gen);
        this.setStatus({ state: 'ready' });
        return url;
      } catch (error) {
        await this.backoffOrFail(gen, error);
      }
    }
  }

  private async launchOnce(gen: number): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    const port = await freePort();
    if (this.cancelled(gen)) throw new Error('엔진 시작 취소');
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

    // 청크 경계에 걸친 비밀키를 막기 위해 줄 단위로 모아 마스킹한다.
    const attachLog = (stream: NodeJS.ReadableStream | null) => {
      if (!stream) return;
      let buffer = '';
      const emit = (line: string) => {
        const text = redact(line, secret).trimEnd();
        if (text) this.options.log?.(text);
      };
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(emit);
      });
      stream.on('end', () => {
        emit(buffer);
        buffer = '';
      });
    };
    attachLog(child.stdout);
    attachLog(child.stderr);

    let failure: string | null = null;
    const exited = new Promise<void>((resolve) => {
      child.once('exit', (code, signal) => {
        failure ??= `엔진 종료 (exit ${code ?? signal})`;
        resolve();
      });
      child.once('error', (err) => {
        failure ??= `엔진 실행 실패: ${err.message}`;
        resolve();
      });
    });

    const abort = async (error: Error): Promise<never> => {
      if (this.child === child) this.child = null;
      await killChild(child);
      throw error;
    };

    const deadline = Date.now() + this.readinessTimeoutMs;
    for (;;) {
      if (this.cancelled(gen)) return abort(new Error('엔진 시작 취소'));
      if (failure !== null) return abort(new Error(failure));
      if (Date.now() > deadline) return abort(new Error('준비 확인 시간 초과'));
      let ok = false;
      try {
        ok = (await fetch(statusUrl)).ok;
      } catch {
        // 아직 대기 중
      }
      if (this.cancelled(gen)) return abort(new Error('엔진 시작 취소'));
      if (ok && failure === null) break;
      await Promise.race([sleep(100), exited]);
    }

    this.acpUrl = acpUrl;
    this.clearStableTimer();
    this.stableTimer = setTimeout(() => {
      this.restarts = 0;
    }, this.stableMs);
    this.stableTimer.unref?.();
    void exited.then(() => this.onUnexpectedExit(child, gen));
    return acpUrl;
  }

  private onUnexpectedExit(child: ChildProcess, gen: number): void {
    if (this.cancelled(gen) || this.child !== child) return;
    this.clearStableTimer();
    this.acpUrl = null;
    this.child = null;
    void (async () => {
      try {
        await this.backoffOrFail(gen, new Error('엔진 비정상 종료'));
        await this.launchWithRetry(gen);
      } catch {
        // 상태는 이미 failed/stopped로 반영됨
      }
    })();
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.emit('status', status);
  }
}
