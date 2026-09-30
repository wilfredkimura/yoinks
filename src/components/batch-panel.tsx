import React from 'react'
import {Box, Text} from 'ink'
import {Panel} from './panel.js'
import {ProgressBar} from './progress-bar.js'
import {useTheme} from '../theme.js'
import type {DownloadTask, QueueStats} from '../lib/queue.js'
import {formatBytes, formatSpeed, truncate} from '../lib/format.js'

export type BatchPanelProps = {
  tasks: DownloadTask[]
  stats: QueueStats
  width: number
}

function taskStatusIcon(status: DownloadTask['status']): string {
  switch (status) {
    case 'done':
      return '✔'
    case 'downloading':
      return '↓'
    case 'processing':
      return '⚙'
    case 'probing':
      return '…'
    case 'error':
      return '✗'
    case 'cancelled':
      return '⊘'
    default:
      return '·'
  }
}

export function BatchPanel({tasks, stats, width}: BatchPanelProps) {
  const theme = useTheme()
  const percent = stats.total > 0 ? (stats.completed + stats.failed + stats.cancelled) / stats.total : 0
  const speedLabel = stats.speed > 0 ? `  ${formatSpeed(stats.speed)}` : ''

  // Show up to 5 most relevant items: active tasks first, then recent
  const visibleTasks = [...tasks]
    .sort((a, b) => {
      const order: Record<DownloadTask['status'], number> = {
        downloading: 0,
        processing: 1,
        probing: 2,
        queued: 3,
        idle: 4,
        error: 5,
        done: 6,
        cancelled: 7,
      }
      return order[a.status] - order[b.status]
    })
    .slice(0, 5)

  return (
    <Panel title={`Batch Queue (${stats.completed}/${stats.total})`} width={width}>
      <Box flexDirection="column" marginY={1}>
        <Box justifyContent="center" marginBottom={1}>
          <ProgressBar percent={percent} width={Math.max(16, width - 16)} />
        </Box>
        <Box justifyContent="center" marginBottom={1}>
          <Text color={theme.gray} dimColor={theme.dimSecondary}>
            {`active: ${stats.active}  waiting: ${stats.pending}  failed: ${stats.failed}${speedLabel}`}
          </Text>
        </Box>

        <Box flexDirection="column">
          {visibleTasks.map(task => {
            const icon = taskStatusIcon(task.status)
            const title = truncate(task.title || task.url, Math.max(20, width - 26))
            let detail: string = task.status
            if (task.status === 'downloading' && task.progress) {
              const p = task.progress
              const pct =
                p.totalBytes && p.totalBytes > 0
                  ? `${Math.round((p.downloadedBytes / p.totalBytes) * 100)}%`
                  : formatBytes(p.downloadedBytes)
              detail = pct
            } else if (task.status === 'error') {
              detail = 'error'
            }

            return (
              <Box key={task.id} justifyContent="space-between">
                <Text color={theme.primary}>
                  <Text color={task.status === 'done' ? theme.primary : theme.gray}>
                    {`${icon} `}
                  </Text>
                  {title}
                </Text>
                <Text color={theme.gray} dimColor={theme.dimSecondary}>
                  {` ${detail}`}
                </Text>
              </Box>
            )
          })}
          {tasks.length > 5 && (
            <Box justifyContent="center" marginTop={1}>
              <Text color={theme.gray} dimColor={theme.dimSecondary}>
                {`+ ${tasks.length - 5} more items in queue`}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </Panel>
  )
}
