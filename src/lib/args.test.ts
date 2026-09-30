import assert from 'node:assert/strict'
import test from 'node:test'
import {parseArgs, parseBatchContent} from './args.js'
import {isThemeMode, nextThemeMode, themeFor} from '../theme.js'

test('parses a single url into urls array and initialUrl', () => {
  const result = parseArgs(['https://example.com/video'])
  assert.equal(result.help, false)
  assert.equal(result.version, false)
  assert.equal(result.initialUrl, 'https://example.com/video')
  assert.deepEqual(result.urls, ['https://example.com/video'])
})

test('parses multiple positional URLs into urls array', () => {
  const result = parseArgs(['https://example.com/v1', 'https://example.com/v2', 'https://example.com/v3'])
  assert.equal(result.initialUrl, 'https://example.com/v1')
  assert.deepEqual(result.urls, [
    'https://example.com/v1',
    'https://example.com/v2',
    'https://example.com/v3',
  ])
})

test('parses a url and a spaced theme option without confusing the value for the url', () => {
  assert.deepEqual(parseArgs(['--theme', 'light', 'https://example.com/video']), {
    help: false,
    version: false,
    themeMode: 'light',
    urls: ['https://example.com/video'],
    initialUrl: 'https://example.com/video',
  })
})

test('parses an equals-style theme option after the url', () => {
  assert.deepEqual(parseArgs(['https://example.com/video', '--theme=dark']), {
    help: false,
    version: false,
    themeMode: 'dark',
    urls: ['https://example.com/video'],
    initialUrl: 'https://example.com/video',
  })
})

test('parses batch file flag in short and long forms', () => {
  assert.equal(parseArgs(['-b', 'links.txt']).batchFile, 'links.txt')
  assert.equal(parseArgs(['--batch', 'urls.txt']).batchFile, 'urls.txt')
  assert.equal(parseArgs(['--batch=list.txt']).batchFile, 'list.txt')
})

test('parses output directory flag in short and long forms', () => {
  assert.equal(parseArgs(['-o', '/downloads']).outputDir, '/downloads')
  assert.equal(parseArgs(['--output', 'D:\\videos']).outputDir, 'D:\\videos')
  assert.equal(parseArgs(['--output=./out']).outputDir, './out')
})

test('parses headless preset flags and mode flags', () => {
  const res = parseArgs(['--best', '--mp3', '--gui', '--tui', '--headless', '--preset=1080p', '-c', '4'])
  assert.equal(res.best, true)
  assert.equal(res.mp3, true)
  assert.equal(res.gui, true)
  assert.equal(res.tui, true)
  assert.equal(res.headless, true)
  assert.equal(res.preset, '1080p')
  assert.equal(res.concurrency, 4)
})

test('rejects missing, invalid, and unknown options', () => {
  assert.match(parseArgs(['--theme']).error ?? '', /needs a value/)
  assert.match(parseArgs(['--theme', 'sepia']).error ?? '', /unknown theme/)
  assert.match(parseArgs(['--wat']).error ?? '', /unknown option/)
  assert.match(parseArgs(['-b']).error ?? '', /needs a file path/)
  assert.match(parseArgs(['-o']).error ?? '', /needs a directory path/)
  assert.match(parseArgs(['-c', '0']).error ?? '', /positive integer/)
  assert.match(parseArgs(['--concurrency=abc']).error ?? '', /positive integer/)
  assert.match(parseArgs(['--preset']).error ?? '', /needs a value/)
})

test('parses batch content ignoring comments and empty lines', () => {
  const content = `
    # Here are some links
    https://youtube.com/watch?v=123

    https://x.com/user/status/456
    # another comment
    https://instagram.com/p/789
  `
  const links = parseBatchContent(content)
  assert.deepEqual(links, [
    'https://youtube.com/watch?v=123',
    'https://x.com/user/status/456',
    'https://instagram.com/p/789',
  ])
})

test('recognizes only supported modes and cycles through all of them', () => {
  assert.equal(isThemeMode('auto'), true)
  assert.equal(isThemeMode('light'), true)
  assert.equal(isThemeMode('dark'), true)
  assert.equal(isThemeMode('sepia'), false)
  assert.equal(nextThemeMode('auto'), 'light')
  assert.equal(nextThemeMode('light'), 'dark')
  assert.equal(nextThemeMode('dark'), 'auto')
})

test('auto delegates to terminal colors while forced modes own the full surface', () => {
  assert.deepEqual(themeFor('auto'), {
    mode: 'auto',
    primary: undefined,
    gray: undefined,
    dark: undefined,
    background: undefined,
    dimSecondary: true,
    inverseButton: true,
  })

  assert.equal(themeFor('light').background, '#ffffff')
  assert.equal(themeFor('light').primary, '#18181b')
  assert.equal(themeFor('dark').background, '#18181b')
  assert.equal(themeFor('dark').primary, '#ffffff')
})
