import { desktopConfig } from './config.js';

export async function waitForClient(url: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < desktopConfig.startupTimeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, desktopConfig.retryIntervalMs);
    });
  }

  throw new Error(
    `Workflow Mapper client did not start within ${
      desktopConfig.startupTimeoutMs / 1000
    } seconds.`,
  );
}
