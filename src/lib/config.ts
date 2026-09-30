import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type UserConfig = {
  defaultUi: 'gui' | 'tui'
  defaultPreset: string
  outDir: string
  concurrency: number
  theme: 'auto' | 'light' | 'dark'
  hasRunBefore: boolean
}

export const DEFAULT_CONFIG: UserConfig = {
  defaultUi: 'gui', // Default to GUI on bare launch per user requirement
  defaultPreset: 'best',
  outDir: path.join(os.homedir(), 'Downloads'),
  concurrency: 2,
  theme: 'auto',
  hasRunBefore: false,
}

export function getConfigPath(): string {
  return path.join(os.homedir(), '.config', 'yoinks', 'config.json')
}

export function isFirstRun(configPath = getConfigPath()): boolean {
  return !fs.existsSync(configPath)
}

export function loadConfig(configPath = getConfigPath()): UserConfig {
  try {
    if (!fs.existsSync(configPath)) {
      return {...DEFAULT_CONFIG}
    }
    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      hasRunBefore: true,
    }
  } catch {
    return {...DEFAULT_CONFIG}
  }
}

export function saveConfig(
  updates: Partial<UserConfig>,
  configPath = getConfigPath(),
): UserConfig {
  const current = loadConfig(configPath)
  const updated: UserConfig = {
    ...current,
    ...updates,
    hasRunBefore: true,
  }

  try {
    fs.mkdirSync(path.dirname(configPath), {recursive: true})
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf8')
  } catch {
    // Non-fatal if config write fails
  }

  return updated
}

export function resolveLaunchMode(
  args: {
    gui?: boolean
    tui?: boolean
    headless?: boolean
    urls: string[]
  },
  config: UserConfig = loadConfig(),
  isTTY = Boolean(process.stdout.isTTY),
): 'gui' | 'tui' | 'headless' {
  if (args.headless) return 'headless'
  if (args.gui) return 'gui'
  if (args.tui) return 'tui'

  // If URLs are provided via CLI, default to terminal execution
  if (args.urls.length > 0) {
    return isTTY ? 'tui' : 'headless'
  }

  // Bare launch (no arguments):
  // If first run, or config specifies defaultUi: 'gui', launch GUI automatically
  if (!config.hasRunBefore || config.defaultUi === 'gui') {
    return 'gui'
  }

  return isTTY ? 'tui' : 'headless'
}
