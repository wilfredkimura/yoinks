import {spawn} from 'node:child_process'

export function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      // Use powershell Start-Process or cmd start
      spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [url], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    } else {
      spawn('xdg-open', [url], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    }
  } catch {
    // If opening browser fails, user can still manually open the printed URL
  }
}
