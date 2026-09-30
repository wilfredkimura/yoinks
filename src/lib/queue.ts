import {EventEmitter} from 'node:events'
import os from 'node:os'
import path from 'node:path'
import {
  buildChoices,
  download,
  ensureYtDlp,
  findFfmpeg,
  probe,
  type DownloadChoice,
  type DownloadHandlers,
  type DownloadProgress,
  type ProbeResult,
} from './ytdlp.js'

export type TaskStatus =
  | 'idle'
  | 'probing'
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'done'
  | 'error'
  | 'cancelled'

export type DownloadTask = {
  id: string
  url: string
  status: TaskStatus
  title?: string
  preset?: string
  choice?: DownloadChoice
  progress?: DownloadProgress
  filepath?: string
  error?: string
  outDir: string
  addedAt: number
  startedAt?: number
  finishedAt?: number
  abortController?: AbortController
}

export type QueueStats = {
  total: number
  pending: number
  active: number
  completed: number
  failed: number
  cancelled: number
  downloadedBytes: number
  totalBytes: number
  speed: number
}

export type QueueOptions = {
  concurrency?: number
  outDir?: string
  defaultPreset?: string
  probeFn?: (ytdlp: string, url: string, signal?: AbortSignal) => Promise<ProbeResult>
  downloadFn?: (
    opts: {
      ytdlp: string
      ffmpegLocation?: string
      url: string
      infoJsonPath?: string
      choice: DownloadChoice
      outDir: string
    },
    handlers: DownloadHandlers,
    signal?: AbortSignal,
  ) => Promise<string>
  ensureYtDlpFn?: (onStatus: (msg: string) => void, signal?: AbortSignal) => Promise<string>
  findFfmpegFn?: () => Promise<string | undefined>
}

let taskIdCounter = 0

function selectChoiceByPreset(choices: DownloadChoice[], preset: string = 'best'): DownloadChoice {
  if (choices.length === 0) {
    return {
      kind: 'video',
      label: 'best available · mp4',
      args: ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4'],
    }
  }

  const normalized = preset.toLowerCase().trim()
  if (normalized === 'mp3' || normalized === 'audio') {
    const audioChoice = choices.find(c => c.kind === 'audio')
    if (audioChoice) return audioChoice
  }

  if (normalized.endsWith('p')) {
    const matched = choices.find(c => c.kind === 'video' && c.label.includes(normalized))
    if (matched) return matched
  }

  // default to best video choice
  const videoChoice = choices.find(c => c.kind === 'video')
  return videoChoice ?? choices[0]!
}

export class BatchQueue extends EventEmitter {
  private tasks: Map<string, DownloadTask> = new Map()
  private concurrency: number
  private defaultOutDir: string
  private defaultPreset: string
  private running = false
  private activeCount = 0
  private ytdlpPath?: string
  private ffmpegPath?: string

  private probeFn: (ytdlp: string, url: string, signal?: AbortSignal) => Promise<ProbeResult>
  private downloadFn: (
    opts: {
      ytdlp: string
      ffmpegLocation?: string
      url: string
      infoJsonPath?: string
      choice: DownloadChoice
      outDir: string
    },
    handlers: DownloadHandlers,
    signal?: AbortSignal,
  ) => Promise<string>
  private ensureYtDlpFn: (onStatus: (msg: string) => void, signal?: AbortSignal) => Promise<string>
  private findFfmpegFn: () => Promise<string | undefined>

  constructor(options: QueueOptions = {}) {
    super()
    this.concurrency = Math.max(1, options.concurrency ?? 2)
    this.defaultOutDir = options.outDir ?? path.join(os.homedir(), 'Downloads')
    this.defaultPreset = options.defaultPreset ?? 'best'

    this.probeFn = options.probeFn ?? probe
    this.downloadFn = options.downloadFn ?? download
    this.ensureYtDlpFn = options.ensureYtDlpFn ?? ensureYtDlp
    this.findFfmpegFn = options.findFfmpegFn ?? findFfmpeg
  }

  public enqueue(
    urls: string | string[],
    options: {preset?: string; outDir?: string} = {},
  ): DownloadTask[] {
    const urlList = Array.isArray(urls) ? urls : [urls]
    const addedTasks: DownloadTask[] = []

    for (const url of urlList) {
      const trimmed = url.trim()
      if (!trimmed) continue

      const id = `task-${++taskIdCounter}-${Date.now().toString(36)}`
      const task: DownloadTask = {
        id,
        url: trimmed,
        status: 'idle',
        preset: options.preset ?? this.defaultPreset,
        outDir: options.outDir ?? this.defaultOutDir,
        addedAt: Date.now(),
      }

      this.tasks.set(id, task)
      addedTasks.push(task)
      this.emit('task:added', task)
    }

    if (this.running) {
      this.tick()
    }

    return addedTasks
  }

  public start(): void {
    if (this.running) return
    this.running = true
    this.tick()
  }

  public pause(): void {
    this.running = false
  }

  public isRunning(): boolean {
    return this.running
  }

  public cancel(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
      return false
    }

    if (task.abortController) {
      task.abortController.abort()
    }

    task.status = 'cancelled'
    task.finishedAt = Date.now()
    this.emit('task:update', task)
    this.emit('queue:progress', this.getStats())
    this.tick()
    return true
  }

  public cancelAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status !== 'done' && task.status !== 'error' && task.status !== 'cancelled') {
        if (task.abortController) {
          task.abortController.abort()
        }
        task.status = 'cancelled'
        task.finishedAt = Date.now()
        this.emit('task:update', task)
      }
    }
    this.activeCount = 0
    this.emit('queue:progress', this.getStats())
  }

  public getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id)
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values())
  }

  public getStats(): QueueStats {
    let pending = 0
    let active = 0
    let completed = 0
    let failed = 0
    let cancelled = 0
    let downloadedBytes = 0
    let totalBytes = 0
    let speed = 0

    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'idle':
        case 'queued':
          pending++
          break
        case 'probing':
        case 'downloading':
        case 'processing':
          active++
          break
        case 'done':
          completed++
          break
        case 'error':
          failed++
          break
        case 'cancelled':
          cancelled++
          break
      }

      if (task.progress) {
        downloadedBytes += task.progress.downloadedBytes ?? 0
        totalBytes += task.progress.totalBytes ?? 0
        speed += task.progress.speed ?? 0
      }
    }

    return {
      total: this.tasks.size,
      pending,
      active,
      completed,
      failed,
      cancelled,
      downloadedBytes,
      totalBytes,
      speed,
    }
  }

  private async initEngines(signal?: AbortSignal): Promise<void> {
    if (!this.ytdlpPath) {
      this.ytdlpPath = await this.ensureYtDlpFn(() => {}, signal)
    }
    if (this.ffmpegPath === undefined) {
      this.ffmpegPath = await this.findFfmpegFn()
    }
  }

  private tick(): void {
    if (!this.running) return

    while (this.activeCount < this.concurrency) {
      const nextTask = Array.from(this.tasks.values()).find(
        t => t.status === 'idle' || t.status === 'queued',
      )
      if (!nextTask) break

      this.activeCount++
      nextTask.status = 'probing'
      nextTask.startedAt = Date.now()
      this.emit('task:update', nextTask)
      this.emit('queue:progress', this.getStats())

      void this.executeTask(nextTask).finally(() => {
        this.activeCount--
        this.emit('queue:progress', this.getStats())
        this.tick()
        this.checkDrain()
      })
    }
  }

  private checkDrain(): void {
    const stats = this.getStats()
    if (stats.active === 0 && stats.pending === 0 && stats.total > 0) {
      this.emit('queue:drain', {
        completed: stats.completed,
        failed: stats.failed,
        cancelled: stats.cancelled,
        total: stats.total,
      })
    }
  }

  private async executeTask(task: DownloadTask): Promise<void> {
    const controller = new AbortController()
    task.abortController = controller

    try {
      await this.initEngines(controller.signal)
      if (controller.signal.aborted) return

      // Step 1: Probe
      const probeResult = await this.probeFn(this.ytdlpPath!, task.url, controller.signal)
      if (controller.signal.aborted) return

      task.title = probeResult.info.title
      const choices = buildChoices(probeResult.info)
      const choice = selectChoiceByPreset(choices, task.preset)
      task.choice = choice

      // Step 2: Download
      task.status = 'downloading'
      this.emit('task:update', task)
      this.emit('queue:progress', this.getStats())

      const handlers: DownloadHandlers = {
        onProgress: (progress: DownloadProgress) => {
          task.progress = progress
          task.status = 'downloading'
          this.emit('task:update', task)
          this.emit('queue:progress', this.getStats())
        },
        onProcessing: () => {
          task.status = 'processing'
          this.emit('task:update', task)
          this.emit('queue:progress', this.getStats())
        },
      }

      const filepath = await this.downloadFn(
        {
          ytdlp: this.ytdlpPath!,
          ffmpegLocation: this.ffmpegPath,
          url: task.url,
          infoJsonPath: probeResult.infoJsonPath,
          choice,
          outDir: task.outDir,
        },
        handlers,
        controller.signal,
      )

      task.filepath = filepath
      task.status = 'done'
      task.finishedAt = Date.now()
      this.emit('task:complete', task)
      this.emit('task:update', task)
    } catch (err: unknown) {
      if (controller.signal.aborted || task.status === 'cancelled') {
        task.status = 'cancelled'
      } else {
        task.status = 'error'
        task.error = err instanceof Error ? err.message : String(err)
        this.emit('task:error', task, err)
      }
      task.finishedAt = Date.now()
      this.emit('task:update', task)
    } finally {
      task.abortController = undefined
    }
  }
}
