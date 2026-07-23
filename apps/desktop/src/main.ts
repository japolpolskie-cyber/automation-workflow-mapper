import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window.js';
import { startServer, stopServer } from './services/server.js';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

async function openMainWindow(): Promise<void> {
  mainWindow = await createMainWindow();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await openMainWindow();
  } catch (error) {
    console.error('Failed to start desktop application:', error);

    stopServer();
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void openMainWindow();
    }
  });
});

app.on('before-quit', () => {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  stopServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});