import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type ClientTask,
  upsertTask,
  filterTasks,
  calculateAggregateStats,
} from './queue-state.js'

test('upserts new tasks and updates existing tasks by ID', () => {
  const initial: ClientTask[] = [
    {id: '1', url: 'https://youtube.com/watch?v=1', status: 'idle'},
  ]

  // Add task 2
  const step1 = upsertTask(initial, {id: '2', url: 'https://youtube.com/watch?v=2', status: 'idle'})
  assert.equal(step1.length, 2)

  // Update task 1 to downloading with title
  const step2 = upsertTask(step1, {
    id: '1',
    url: 'https://youtube.com/watch?v=1',
    status: 'downloading',
    title: 'Awesome Song',
  })
  assert.equal(step2.length, 2)
  assert.equal(step2[0]?.status, 'downloading')
  assert.equal(step2[0]?.title, 'Awesome Song')
})

test('filters tasks accurately by active, completed, and failed status', () => {
  const tasks: ClientTask[] = [
    {id: '1', url: 'u1', status: 'downloading'},
    {id: '2', url: 'u2', status: 'done'},
    {id: '3', url: 'u3', status: 'error'},
    {id: '4', url: 'u4', status: 'idle'},
  ]

  assert.equal(filterTasks(tasks, 'all').length, 4)
  assert.equal(filterTasks(tasks, 'active').length, 1)
  assert.equal(filterTasks(tasks, 'active')[0]?.id, '1')
  assert.equal(filterTasks(tasks, 'completed').length, 1)
  assert.equal(filterTasks(tasks, 'completed')[0]?.id, '2')
  assert.equal(filterTasks(tasks, 'failed').length, 1)
  assert.equal(filterTasks(tasks, 'failed')[0]?.id, '3')
})

test('calculates aggregated queue metrics and speed totals accurately', () => {
  const tasks: ClientTask[] = [
    {
      id: '1',
      url: 'u1',
      status: 'downloading',
      progress: {downloadedBytes: 50, totalBytes: 100, speed: 10},
    },
    {
      id: '2',
      url: 'u2',
      status: 'downloading',
      progress: {downloadedBytes: 30, totalBytes: 100, speed: 5},
    },
    {
      id: '3',
      url: 'u3',
      status: 'done',
    },
  ]

  const stats = calculateAggregateStats(tasks)
  assert.equal(stats.total, 3)
  assert.equal(stats.active, 2)
  assert.equal(stats.completed, 1)
  assert.equal(stats.downloadedBytes, 80)
  assert.equal(stats.totalBytes, 200)
  assert.equal(stats.totalSpeed, 15)
  assert.equal(stats.overallPercent, 40)
})
