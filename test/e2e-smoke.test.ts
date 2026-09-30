import assert from 'node:assert/strict'
import test from 'node:test'
import {startGuiServer} from '../src/gui/server.js'
import {BatchQueue} from '../src/lib/queue.js'
import {parseArgs} from '../src/lib/args.js'
import {resolveLaunchMode, DEFAULT_CONFIG} from '../src/lib/config.js'

test('E2E: GUI server launches and serves web interface and API', async () => {
  const queue = new BatchQueue({
    concurrency: 2,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
  })

  const instance = await startGuiServer({
    port: 5995,
    queue,
  })

  try {
    // Check status API
    const res = await fetch(`${instance.url}/api/status`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.status, 'online')

    // Check HTML serving
    const htmlRes = await fetch(`${instance.url}/`)
    assert.equal(htmlRes.status, 200)
    const html = await htmlRes.text()
    assert.ok(html.includes('yoinks — bulk video & audio downloader'))
    assert.ok(html.includes('linksInput'))
    assert.ok(html.includes('yoinkAllBtn'))

    // Check CSS serving
    const cssRes = await fetch(`${instance.url}/styles.css`)
    assert.equal(cssRes.status, 200)
    const css = await cssRes.text()
    assert.ok(css.includes('--accent-gradient'))
  } finally {
    await instance.close()
  }
})

test('E2E: Launch mode resolution correctly selects GUI on bare initial run', () => {
  const args = parseArgs([])
  const firstRunConfig = {...DEFAULT_CONFIG, hasRunBefore: false}
  const mode = resolveLaunchMode({urls: args.urls, gui: args.gui, tui: args.tui}, firstRunConfig, true)
  assert.equal(mode, 'gui')
})

test('E2E: Launch mode resolution selects headless for batch presets', () => {
  const args = parseArgs(['--best', 'https://youtu.be/test1', 'https://youtu.be/test2'])
  assert.equal(args.best, true)
  assert.equal(args.urls.length, 2)
  const mode = resolveLaunchMode(
    {urls: args.urls, headless: args.headless || (args.urls.length > 0 && (args.best || args.mp3))},
    DEFAULT_CONFIG,
    true,
  )
  assert.equal(mode, 'headless')
})
