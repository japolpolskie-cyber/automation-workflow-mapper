import { BrowserWindow, shell } from 'electron';
import { desktopConfig } from './config.js';
import { waitForClient } from './runtime.js';

function isAllowedInternalNavigation(url: string): boolean {
  if (desktopConfig.useDevClient) {
    return url.startsWith(desktopConfig.clientUrl);
  }

  return url.startsWith('file://');
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (desktopConfig.useDevClient) {
    await waitForClient(desktopConfig.clientUrl);
    await window.loadURL(desktopConfig.clientUrl);
    return;
  }

  await window.loadFile(desktopConfig.clientIndexPath);
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: desktopConfig.window.width,
    height: desktopConfig.window.height,
    minWidth: desktopConfig.window.minWidth,
    minHeight: desktopConfig.window.minHeight,
    show: false,
    title: desktopConfig.window.title,
    backgroundColor: desktopConfig.window.backgroundColor,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedInternalNavigation(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  await loadRenderer(window);

  return window;
}
