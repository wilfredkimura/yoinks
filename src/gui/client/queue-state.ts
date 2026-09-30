export type ClientTask = {
  id: string
  url: string
  status: 'idle' | 'probing' | 'queued' | 'downloading' | 'processing' | 'done' | 'error' | 'cancelled'
  title?: string
  preset?: string
  progress?: {
    downloadedBytes: number
    totalBytes?: number
    speed?: number
    eta?: number
  }
  filepath?: string
  error?: string
}

export type QueueState = {
  tasks: ClientTask[]
  filter: 'all' | 'active' | 'completed' | 'failed'
}

export function createTaskMap(tasks: ClientTask[]): Map<string, ClientTask> {
  const map = new Map<string, ClientTask>()
  for (const task of tasks) {
    map.set(task.id, task)
  }
  return map
}

export function upsertTask(tasks: ClientTask[], updated: ClientTask): ClientTask[] {
  const index = tasks.findIndex(t => t.id === updated.id)
  if (index === -1) {
    return [...tasks, updated]
  }
  const next = [...tasks]
  next[index] = {...next[index], ...updated}
  return next
}

export function filterTasks(tasks: ClientTask[], filter: QueueState['filter']): ClientTask[] {
  switch (filter) {
    case 'active':
      return tasks.filter(t => t.status === 'downloading' || t.status === 'processing' || t.status === 'probing')
    case 'completed':
      return tasks.filter(t => t.status === 'done')
    case 'failed':
      return tasks.filter(t => t.status === 'error' || t.status === 'cancelled')
    default:
      return tasks
  }
}

export function calculateAggregateStats(tasks: ClientTask[]) {
  let completed = 0
  let active = 0
  let failed = 0
  let totalSpeed = 0
  let downloadedBytes = 0
  let totalBytes = 0

  for (const t of tasks) {
    if (t.status === 'done') completed++
    else if (t.status === 'error' || t.status === 'cancelled') failed++
    else if (t.status === 'downloading' || t.status === 'processing' || t.status === 'probing') active++

    if (t.progress) {
      downloadedBytes += t.progress.downloadedBytes || 0
      totalBytes += t.progress.totalBytes || 0
      totalSpeed += t.progress.speed || 0
    }
  }

  const overallPercent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0

  return {
    total: tasks.length,
    completed,
    active,
    failed,
    totalSpeed,
    downloadedBytes,
    totalBytes,
    overallPercent,
  }
}
