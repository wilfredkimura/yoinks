import fs from 'node:fs'
import {isThemeMode, type ThemeMode} from '../theme.js'

export type CliArgs = {
  help: boolean
  version: boolean
  urls: string[]
  initialUrl?: string
  batchFile?: string
  outputDir?: string
  best?: boolean
  mp3?: boolean
  preset?: string
  gui?: boolean
  tui?: boolean
  headless?: boolean
  concurrency?: number
  themeMode?: ThemeMode
  error?: string
}

export function parseBatchContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
}

export function readBatchFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8')
  return parseBatchContent(content)
}

export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    help: false,
    version: false,
    urls: [],
  }
  const positional: string[] = []

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '-h' || arg === '--help') {
      result.help = true
    } else if (arg === '-v' || arg === '--version') {
      result.version = true
    } else if (arg === '--best') {
      result.best = true
    } else if (arg === '--mp3') {
      result.mp3 = true
    } else if (arg === '--gui') {
      result.gui = true
    } else if (arg === '--tui') {
      result.tui = true
    } else if (arg === '--headless') {
      result.headless = true
    } else if (arg === '-b' || arg === '--batch') {
      const value = args[++index]
      if (!value) return {...result, error: `${arg} needs a file path`}
      result.batchFile = value
    } else if (arg.startsWith('--batch=')) {
      result.batchFile = arg.slice('--batch='.length)
    } else if (arg === '-o' || arg === '--output') {
      const value = args[++index]
      if (!value) return {...result, error: `${arg} needs a directory path`}
      result.outputDir = value
    } else if (arg.startsWith('--output=')) {
      result.outputDir = arg.slice('--output='.length)
    } else if (arg === '-c' || arg === '--concurrency') {
      const value = args[++index]
      if (!value) return {...result, error: `${arg} needs a number`}
      const n = parseInt(value, 10)
      if (isNaN(n) || n < 1) return {...result, error: `${arg} must be a positive integer`}
      result.concurrency = n
    } else if (arg.startsWith('--concurrency=')) {
      const value = arg.slice('--concurrency='.length)
      const n = parseInt(value, 10)
      if (isNaN(n) || n < 1) return {...result, error: '--concurrency must be a positive integer'}
      result.concurrency = n
    } else if (arg === '--preset') {
      const value = args[++index]
      if (!value) return {...result, error: '--preset needs a value'}
      result.preset = value
    } else if (arg.startsWith('--preset=')) {
      result.preset = arg.slice('--preset='.length)
    } else if (arg === '--theme') {
      const value = args[++index]
      if (!value) return {...result, error: '--theme needs a value: auto, light, or dark'}
      if (!isThemeMode(value)) return {...result, error: `unknown theme “${value}” — use auto, light, or dark`}
      result.themeMode = value
    } else if (arg.startsWith('--theme=')) {
      const value = arg.slice('--theme='.length)
      if (!isThemeMode(value)) return {...result, error: `unknown theme “${value}” — use auto, light, or dark`}
      result.themeMode = value
    } else if (arg.startsWith('-')) {
      return {...result, error: `unknown option “${arg}”`}
    } else {
      positional.push(arg)
    }
  }

  result.urls = positional
  result.initialUrl = positional[0]
  return result
}
