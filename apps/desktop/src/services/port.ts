import { createServer } from 'node:net';

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolveAvailability) => {
    const server = createServer();
    let settled = false;

    const finish = (available: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolveAvailability(available);
    };

    server.unref();
    server.once('error', () => {
      finish(false);
    });
    server.once('listening', () => {
      server.close((error) => {
        finish(!error);
      });
    });

    try {
      server.listen({
        host: '127.0.0.1',
        port,
        exclusive: true,
      });
    } catch {
      finish(false);
    }
  });
}

export async function findAvailablePort(startPort = 4000): Promise<number> {
  const maximumAttempts = 100;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const port = startPort + attempt;

    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `No available backend port found after ${maximumAttempts} attempts starting at ${startPort}.`,
  );
}
