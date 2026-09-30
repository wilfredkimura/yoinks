import os from 'node:os'
import type {BatchQueue, DownloadTask} from './queue.js'
import {formatBytes, formatEta, formatSpeed, shortenPath, truncate} from './format.js'

export type HeadlessOptions = {
  verbose?: boolean
  stdout?: {write: (msg: string) => void}
}

export type HeadlessResult = {
  total: number
  completed: number
  failed: number
  cancelled: number
  tasks: DownloadTask[]
}

export async function runHeadless(
  queue: BatchQueue,
  options: HeadlessOptions = {},
): Promise<HeadlessResult> {
  const write = options.stdout ? options.stdout.write.bind(options.stdout) : process.stdout.write.bind(process.stdout)
  const homedir = os.homedir()

  write('yoinks batch runner starting…\n')

  let lastLineLength = 0
  const clearInline = () => {
    if (process.stdout.isTTY && lastLineLength > 0) {
      write('\r' + ' '.repeat(lastLineLength) + '\r')
      lastLineLength = 0
    }
  }

  queue.on('task:update', (task: DownloadTask) => {
    if (task.status === 'downloading' && task.progress) {
      const p = task.progress
      const percent =
        p.totalBytes && p.totalBytes > 0
          ? `${Math.round((p.downloadedBytes / p.totalBytes) * 100)}%`
          : formatBytes(p.downloadedBytes)
      const speed = p.speed ? ` · ${formatSpeed(p.speed)}` : ''
      const eta = p.eta ? ` · ${formatEta(p.eta)} left` : ''
      const title = truncate(task.title || task.url, 40)
      const line = `  ↓ ${title}  ${percent}${speed}${eta}`

      if (process.stdout.isTTY) {
        clearInline()
        write(line)
        lastLineLength = line.length
      }
    }
  })

  queue.on('task:complete', (task: DownloadTask) => {
    clearInline()
    const prettyPath = task.filepath ? shortenPath(task.filepath, homedir) : 'done'
    write(`✓ yoinked → ${prettyPath}\n`)
  })

  queue.on('task:error', (task: DownloadTask, error: unknown) => {
    clearInline()
    const msg = error instanceof Error ? error.message : String(error)
    write(`✗ failed: ${task.title || task.url} (${msg})\n`)
  })

  queue.start()

  return new Promise(resolve => {
    queue.on('queue:drain', summary => {
      clearInline()
      write(`\nFinished: ${summary.completed} downloaded, ${summary.failed} failed out of ${summary.total} total.\n`)
      resolve({
        total: summary.total,
        completed: summary.completed,
        failed: summary.failed,
        cancelled: summary.cancelled,
        tasks: queue.getTasks(),
      })
    })
  })
}
