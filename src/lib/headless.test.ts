import assert from 'node:assert/strict'
import test from 'node:test'
import {BatchQueue} from './queue.js'
import {runHeadless} from './headless.js'

test('headless runner executes queue and writes output to stream', async () => {
  const output: string[] = []
  const mockStdout = {
    write: (msg: string) => output.push(msg),
  }

  const queue = new BatchQueue({
    concurrency: 2,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
    probeFn: async (_ytdlp, url) => ({
      info: {
        title: `Video for ${url}`,
        formats: [{format_id: '1', height: 1080, vcodec: 'avc1', acodec: 'mp4a', ext: 'mp4'}],
      },
      infoJsonPath: '/tmp/test.json',
    }),
    downloadFn: async (opts, handlers) => {
      handlers.onProgress({
        downloadedBytes: 1024 * 1024,
        totalBytes: 2 * 1024 * 1024,
        speed: 512 * 1024,
        eta: 2,
        part: 0,
        totalParts: 1,
      })
      return `/downloads/${opts.url.split('/').pop()}.mp4`
    },
  })

  queue.enqueue(['https://example.com/v1', 'https://example.com/v2'])

  const result = await runHeadless(queue, {stdout: mockStdout})

  assert.equal(result.total, 2)
  assert.equal(result.completed, 2)
  assert.equal(result.failed, 0)

  const combinedOutput = output.join('')
  assert.ok(combinedOutput.includes('yoinks batch runner starting'))
  assert.ok(combinedOutput.includes('✓ yoinked →'))
  assert.ok(combinedOutput.includes('Finished: 2 downloaded, 0 failed out of 2 total.'))
})
