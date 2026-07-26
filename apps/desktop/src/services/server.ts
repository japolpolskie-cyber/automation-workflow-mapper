import { spawn, type ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
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
const databaseFileName = 'automation-workflow-mapper.db';

function databaseFootprint(databasePath: string): number {
  return ['', '-wal']
    .map((suffix) => `${databasePath}${suffix}`)
    .filter((candidate) => existsSync(candidate))
    .reduce((total, candidate) => total + statSync(candidate).size, 0);
}

function prepareDatabasePath(): string {
  const databaseDirectory = resolve(app.getPath('userData'), 'data');
  const databasePath = resolve(databaseDirectory, databaseFileName);

  mkdirSync(databaseDirectory, { recursive: true });

  if (databaseFootprint(databasePath) > 0) {
    return databasePath;
  }

  const legacyCandidates = [
    resolve(dirname(serverEntry), '..', 'data', databaseFileName),
    resolve(dirname(process.execPath), 'data', databaseFileName),
    resolve(process.cwd(), 'data', databaseFileName),
  ];
  const legacyDatabasePath = legacyCandidates
    .filter((candidate, index, candidates) => (
      candidates.indexOf(candidate) === index
      && databaseFootprint(candidate) > 0
    ))
    .sort((left, right) => (
      databaseFootprint(right) - databaseFootprint(left)
    ))[0];

  if (legacyDatabasePath) {
    copyFileSync(legacyDatabasePath, databasePath);

    const legacyWalPath = `${legacyDatabasePath}-wal`;
    if (existsSync(legacyWalPath) && statSync(legacyWalPath).size > 0) {
      copyFileSync(legacyWalPath, `${databasePath}-wal`);
    }

    console.log(`Recovered desktop database from: ${legacyDatabasePath}`);
  }

  return databasePath;
}

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
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `Backend exited before becoming ready with code ${serverProcess.exitCode}`,
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
  const databasePath = prepareDatabasePath();
  console.log(`Backend selected port: ${serverPort}`);
  console.log(`Desktop database path: ${databasePath}`);

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      ELECTRON_RUN_AS_NODE: '1',
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
    serverPort = 0;
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
    serverPort = 0;
    return;
  }

  serverProcess.kill();

  serverProcess = null;
  serverPort = 0;
}
