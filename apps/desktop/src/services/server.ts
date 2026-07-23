import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAvailablePort } from './port.js';

let serverProcess: ChildProcess | null = null;
let serverPort = 0;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverEntry = resolve(
  __dirname,
  '../../../server/dist/index.js',
);

const serverStartupTimeoutMs = 20_000;
const serverPollIntervalMs = 250;

export function getServerPort(): number {
  return serverPort;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

async function waitForServer(): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < serverStartupTimeoutMs) {
    if (serverProcess?.exitCode !== null) {
      throw new Error(
        `Backend exited before becoming ready with code ${serverProcess?.exitCode}`,
      );
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${getServerPort()}/api/health`,
      );

      if (response.ok) {
        return;
      }
    } catch {
      // Expected while Fastify is still starting.
    }

    await delay(serverPollIntervalMs);
  }

  throw new Error(
    `Backend did not become ready within ${serverStartupTimeoutMs}ms`,
  );
}

export async function startServer(): Promise<void> {
  if (serverProcess) {
    return;
  }

  serverPort = await findAvailablePort();
  console.log(`Backend selected port: ${serverPort}`);

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(serverPort),
    },
    stdio: 'inherit',
    shell: false,
  });

  serverProcess.once('exit', (code, signal) => {
    console.log(
      `Backend exited with code ${String(code)} and signal ${String(signal)}`,
    );

    serverProcess = null;
  });

  try {
    await waitForServer();
  } catch (error) {
    stopServer();
    throw error;
  }
}

export function stopServer(): void {
  if (!serverProcess) {
    return;
  }

  serverProcess.kill();
  serverProcess = null;
}
