import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import {renderToString} from 'ink'
import {BatchPanel} from './batch-panel.js'
import {ThemeProvider} from '../theme.js'
import type {DownloadTask, QueueStats} from '../lib/queue.js'

test('BatchPanel renders queue summary header and task statuses', () => {
  const stats: QueueStats = {
    total: 3,
    pending: 1,
    active: 1,
    completed: 1,
    failed: 0,
    cancelled: 0,
    downloadedBytes: 50 * 1024 * 1024,
    totalBytes: 100 * 1024 * 1024,
    speed: 5 * 1024 * 1024,
  }

  const tasks: DownloadTask[] = [
    {
      id: '1',
      url: 'https://youtube.com/watch?v=one',
      title: 'First Video',
      status: 'done',
      outDir: '/downloads',
      addedAt: Date.now(),
    },
    {
      id: '2',
      url: 'https://youtube.com/watch?v=two',
      title: 'Second Video',
      status: 'downloading',
      outDir: '/downloads',
      addedAt: Date.now(),
      progress: {
        downloadedBytes: 50 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024,
        speed: 5 * 1024 * 1024,
        eta: 10,
        part: 0,
        totalParts: 1,
      },
    },
    {
      id: '3',
      url: 'https://youtube.com/watch?v=three',
      status: 'queued',
      outDir: '/downloads',
      addedAt: Date.now(),
    },
  ]

  const output = renderToString(
    React.createElement(
      ThemeProvider,
      {
        mode: 'dark',
        children: React.createElement(BatchPanel, {tasks, stats, width: 60}),
      },
    ),
  )

  assert.ok(output.includes('Batch Queue (1/3)'))
  assert.ok(output.includes('active: 1'))
  assert.ok(output.includes('waiting: 1'))
  assert.ok(output.includes('First Video'))
  assert.ok(output.includes('Second Video'))
  assert.ok(output.includes('50%'))
})
