import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDistDirectory = dirname(fileURLToPath(import.meta.url));

export const desktopConfig = {
  useDevClient: process.argv.includes('--dev-client'),

  clientUrl: 'http://localhost:5174',

  clientIndexPath: resolve(
    desktopDistDirectory,
    '..',
    '..',
    'client',
    'dist',
    'index.html',
  ),

  startupTimeoutMs: 30_000,
  retryIntervalMs: 500,

  window: {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Automation Workflow Mapper',
    backgroundColor: '#0b1020',
  },
} as const;

