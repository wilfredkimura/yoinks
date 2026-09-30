import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {startGuiServer} from './server.js'
import {BatchQueue} from '../lib/queue.js'

test('embedded GUI server starts, handles API endpoints, and shuts down cleanly', async () => {
  const tempStatic = path.join(os.tmpdir(), `yoinks-gui-test-${Date.now()}`)
  fs.mkdirSync(tempStatic, {recursive: true})
  fs.writeFileSync(path.join(tempStatic, 'index.html'), '<h1>yoinks test</h1>')
  fs.writeFileSync(path.join(tempStatic, 'style.css'), 'body { color: black; }')

  const queue = new BatchQueue({
    concurrency: 1,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
    probeFn: async () => ({
      info: {title: 'Test', formats: []},
      infoJsonPath: '/tmp/test.json',
    }),
    downloadFn: async () => '/downloads/test.mp4',
  })

  const instance = await startGuiServer({
    port: 5990,
    staticDir: tempStatic,
    queue,
  })

  try {
    assert.ok(instance.port >= 5990)
    assert.ok(instance.url.startsWith('http://localhost:'))

    // 1. GET /api/status
    const statusRes = await fetch(`${instance.url}/api/status`)
    assert.equal(statusRes.status, 200)
    const statusJson = await statusRes.json()
    assert.equal(statusJson.status, 'online')
    assert.equal(statusJson.stats.total, 0)

    // 2. POST /api/batch
    const batchRes = await fetch(`${instance.url}/api/batch`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        urls: ['https://example.com/one', 'https://example.com/two'],
        preset: 'mp3',
      }),
    })
    assert.equal(batchRes.status, 200)
    const batchJson = await batchRes.json()
    assert.equal(batchJson.added, 2)
    assert.equal(batchJson.tasks.length, 2)
    assert.equal(batchJson.tasks[0].preset, 'mp3')

    // 3. POST /api/cancel
    const cancelRes = await fetch(`${instance.url}/api/cancel`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({}),
    })
    assert.equal(cancelRes.status, 200)
    const cancelJson = await cancelRes.json()
    assert.equal(cancelJson.cancelledAll, true)

    // 4. Static file serving
    const htmlRes = await fetch(`${instance.url}/`)
    assert.equal(htmlRes.status, 200)
    assert.match(htmlRes.headers.get('content-type') ?? '', /text\/html/)
    const htmlText = await htmlRes.text()
    assert.equal(htmlText, '<h1>yoinks test</h1>')

    const cssRes = await fetch(`${instance.url}/style.css`)
    assert.equal(cssRes.status, 200)
    assert.match(cssRes.headers.get('content-type') ?? '', /text\/css/)

    // 5. SSE stream check
    const sseController = new AbortController()
    const sseRes = await fetch(`${instance.url}/api/events`, {
      signal: sseController.signal,
    })
    assert.equal(sseRes.status, 200)
    assert.match(sseRes.headers.get('content-type') ?? '', /text\/event-stream/)
    sseController.abort()
  } finally {
    await instance.close()
    try {
      fs.rmSync(tempStatic, {recursive: true, force: true})
    } catch {}
  }
})
