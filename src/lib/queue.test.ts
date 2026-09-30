import assert from 'node:assert/strict'
import test from 'node:test'
import {BatchQueue, type DownloadTask} from './queue.js'
import type {ProbeResult} from './ytdlp.js'

function createMockProbe(title: string = 'Test Video', delayMs = 10) {
  return async (_ytdlp: string, _url: string, signal?: AbortSignal): Promise<ProbeResult> => {
    if (delayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        })
      })
    }
    return {
      info: {
        title,
        formats: [
          {format_id: '1', height: 1080, vcodec: 'avc1', acodec: 'mp4a', ext: 'mp4'},
          {format_id: '2', height: 720, vcodec: 'avc1', acodec: 'mp4a', ext: 'mp4'},
          {format_id: 'audio', vcodec: 'none', acodec: 'mp3', abr: 320},
        ],
      },
      infoJsonPath: '/tmp/mock-info.json',
    }
  }
}

function createMockDownload(delayMs = 20, shouldFail = false) {
  return async (
    opts: {url: string; outDir: string; choice: {label: string}},
    handlers: {onProgress: Function; onProcessing: Function},
    signal?: AbortSignal,
  ): Promise<string> => {
    if (delayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Download cancelled.'))
        })
      })
    }
    if (shouldFail) {
      throw new Error(`Failed to download ${opts.url}`)
    }
    handlers.onProgress({
      downloadedBytes: 500,
      totalBytes: 1000,
      speed: 100,
      eta: 5,
      part: 0,
      totalParts: 1,
    })
    handlers.onProcessing()
    return `${opts.outDir}/video-${Date.now()}.mp4`
  }
}

test('enqueues multiple tasks and starts execution respecting concurrency limit', async () => {
  let activeAtPeak = 0
  let currentlyActive = 0

  const queue = new BatchQueue({
    concurrency: 2,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
    probeFn: createMockProbe('Video', 15),
    downloadFn: async (opts, handlers, signal) => {
      currentlyActive++
      activeAtPeak = Math.max(activeAtPeak, currentlyActive)
      await new Promise(r => setTimeout(r, 20))
      currentlyActive--
      return '/path/to/download.mp4'
    },
  })

  queue.enqueue(['https://example.com/1', 'https://example.com/2', 'https://example.com/3', 'https://example.com/4'])
  queue.start()

  await new Promise<void>(resolve => {
    queue.on('queue:drain', summary => {
      assert.equal(summary.total, 4)
      assert.equal(summary.completed, 4)
      assert.equal(summary.failed, 0)
      resolve()
    })
  })

  assert.equal(activeAtPeak, 2, 'Never exceeded concurrency limit of 2')
  const stats = queue.getStats()
  assert.equal(stats.completed, 4)
  assert.equal(stats.pending, 0)
  assert.equal(stats.active, 0)
})

test('isolates errors so a failing URL does not stop other downloads', async () => {
  const queue = new BatchQueue({
    concurrency: 1,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
    probeFn: createMockProbe('Video', 5),
    downloadFn: async opts => {
      if (opts.url.includes('fail')) {
        throw new Error('Download exploded')
      }
      return '/path/ok.mp4'
    },
  })

  queue.enqueue(['https://example.com/ok1', 'https://example.com/fail', 'https://example.com/ok2'])
  queue.start()

  await new Promise<void>(resolve => {
    queue.on('queue:drain', summary => {
      assert.equal(summary.total, 3)
      assert.equal(summary.completed, 2)
      assert.equal(summary.failed, 1)
      resolve()
    })
  })

  const tasks = queue.getTasks()
  assert.equal(tasks[0]?.status, 'done')
  assert.equal(tasks[1]?.status, 'error')
  assert.match(tasks[1]?.error ?? '', /Download exploded/)
  assert.equal(tasks[2]?.status, 'done')
})

test('allows cancelling an active or queued task', async () => {
  const queue = new BatchQueue({
    concurrency: 1,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
    probeFn: createMockProbe('Video', 10),
    downloadFn: createMockDownload(100),
  })

  const [t1, t2] = queue.enqueue(['https://example.com/long1', 'https://example.com/long2'])
  queue.start()

  // Wait until first task begins
  await new Promise(r => setTimeout(r, 15))

  // Cancel task 1 and task 2
  const cancelled1 = queue.cancel(t1!.id)
  const cancelled2 = queue.cancel(t2!.id)

  assert.equal(cancelled1, true)
  assert.equal(cancelled2, true)

  const stats = queue.getStats()
  assert.equal(stats.cancelled, 2)
})

test('emits task:update and calculates progress stats accurately', async () => {
  const updates: DownloadTask[] = []

  const queue = new BatchQueue({
    concurrency: 1,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
    probeFn: createMockProbe('Title 1', 5),
    downloadFn: createMockDownload(10),
  })

  queue.on('task:update', t => updates.push({...t}))
  queue.enqueue('https://example.com/prog')
  queue.start()

  await new Promise<void>(resolve => {
    queue.on('queue:drain', () => resolve())
  })

  const statuses = updates.map(u => u.status)
  assert.ok(statuses.includes('probing'))
  assert.ok(statuses.includes('downloading'))
  assert.ok(statuses.includes('processing'))
  assert.ok(statuses.includes('done'))
})

test('selects appropriate format choices based on preset', async () => {
  let chosenLabel = ''

  const queue = new BatchQueue({
    concurrency: 1,
    ensureYtDlpFn: async () => 'mock-ytdlp',
    findFfmpegFn: async () => undefined,
    probeFn: createMockProbe('Music Video', 5),
    downloadFn: async opts => {
      chosenLabel = opts.choice.label
      return '/path/song.mp3'
    },
  })

  queue.enqueue('https://example.com/song', {preset: 'mp3'})
  queue.start()

  await new Promise<void>(resolve => {
    queue.on('queue:drain', () => resolve())
  })

  assert.match(chosenLabel, /audio only · mp3/)
})
