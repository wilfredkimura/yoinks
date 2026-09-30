import {parseLinksWithPlatforms} from './parser.js'

// State
let parsedLinks = []
let activePreset = 'best'
let currentTasks = []
let queueStats = {total: 0, pending: 0, active: 0, completed: 0, failed: 0, speed: 0}

// DOM Elements
const linksInput = document.getElementById('linksInput')
const linkCounter = document.getElementById('linkCounter')
const detectedChips = document.getElementById('detectedChips')
const yoinkAllBtn = document.getElementById('yoinkAllBtn')
const presetButtons = document.querySelectorAll('.preset-btn')
const queueCardsContainer = document.getElementById('queueCardsContainer')
const emptyQueueMsg = document.getElementById('emptyQueueMsg')
const queueStatsBadge = document.getElementById('queueStatsBadge')
const dropZone = document.getElementById('dropZone')
const fileInput = document.getElementById('fileInput')
const importFileBtn = document.getElementById('importFileBtn')
const themeToggleBtn = document.getElementById('themeToggleBtn')
const toastContainer = document.getElementById('toastContainer')

// Format bytes
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let val = bytes
  let unit = 0
  while (val >= 1024 && unit < units.length - 1) {
    val /= 1024
    unit++
  }
  return `${val >= 10 || unit === 0 ? Math.round(val) : val.toFixed(1)} ${units[unit]}`
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div')
  toast.className = 'toast'
  const icon = type === 'success' ? '✔' : type === 'error' ? '✗' : 'ℹ'
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`
  toastContainer.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(10px)'
    toast.style.transition = 'all 0.3s ease'
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

// Input parsing & chips update
function updateInputState() {
  const rawText = linksInput.value
  parsedLinks = parseLinksWithPlatforms(rawText)

  const count = parsedLinks.length
  linkCounter.textContent = `${count} link${count === 1 ? '' : 's'}`
  yoinkAllBtn.disabled = count === 0

  detectedChips.innerHTML = ''
  parsedLinks.slice(0, 10).forEach(item => {
    const chip = document.createElement('div')
    chip.className = 'chip'
    chip.innerHTML = `<span class="chip-platform">${item.platform.label}</span> <span>${truncate(item.url, 28)}</span>`
    detectedChips.appendChild(chip)
  })

  if (count > 10) {
    const more = document.createElement('div')
    more.className = 'chip'
    more.textContent = `+ ${count - 10} more`
    detectedChips.appendChild(more)
  }
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

// Drag & Drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  dropZone.classList.add('dragover')
})

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover')
})

dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('dragover')
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]
    readFileContent(file)
  }
})

importFileBtn.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', e => {
  if (e.target.files && e.target.files.length > 0) {
    readFileContent(e.target.files[0])
  }
})

function readFileContent(file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const content = ev.target?.result
    if (typeof content === 'string') {
      const current = linksInput.value.trim()
      linksInput.value = current ? `${current}\n${content}` : content
      updateInputState()
      showToast(`Loaded links from ${file.name}`, 'success')
    }
  }
  reader.readAsText(file)
}

// Presets
presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    presetButtons.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activePreset = btn.dataset.preset || 'best'
  })
})

// Submit Batch
async function submitBatch() {
  if (parsedLinks.length === 0) return
  yoinkAllBtn.disabled = true
  const urls = parsedLinks.map(l => l.url)

  try {
    const res = await fetch('/api/batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        urls,
        preset: activePreset,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to submit batch')
    }

    const data = await res.json()
    showToast(`Enqueued ${data.added} videos!`, 'success')
    linksInput.value = ''
    updateInputState()
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    yoinkAllBtn.disabled = parsedLinks.length === 0
  }
}

yoinkAllBtn.addEventListener('click', submitBatch)

linksInput.addEventListener('input', updateInputState)
linksInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    submitBatch()
  }
})

// Render Queue
function renderQueueCards(tasks) {
  currentTasks = tasks
  if (!tasks || tasks.length === 0) {
    emptyQueueMsg.style.display = 'block'
    queueCardsContainer.querySelectorAll('.queue-card').forEach(c => c.remove())
    queueStatsBadge.textContent = '0 tasks'
    return
  }

  emptyQueueMsg.style.display = 'none'

  const active = tasks.filter(t => t.status === 'downloading' || t.status === 'processing').length
  const completed = tasks.filter(t => t.status === 'done').length
  const speedStr = queueStats.speed > 0 ? ` · ${formatBytes(queueStats.speed)}/s` : ''
  queueStatsBadge.textContent = `${completed}/${tasks.length} done (${active} active)${speedStr}`

  // Render cards
  const existingMap = new Map()
  queueCardsContainer.querySelectorAll('.queue-card').forEach(el => {
    existingMap.set(el.dataset.id, el)
  })

  tasks.forEach(task => {
    let card = existingMap.get(task.id)
    if (!card) {
      card = document.createElement('div')
      card.className = 'queue-card'
      card.dataset.id = task.id
      queueCardsContainer.appendChild(card)
    }

    const percent =
      task.progress && task.progress.totalBytes
        ? Math.round((task.progress.downloadedBytes / task.progress.totalBytes) * 100)
        : task.status === 'done'
        ? 100
        : 0

    const speed = task.progress?.speed ? ` · ${formatBytes(task.progress.speed)}/s` : ''
    const eta = task.progress?.eta ? ` · ${task.progress.eta}s left` : ''

    card.innerHTML = `
      <div class="card-top">
        <div class="card-meta">
          <span class="card-title" title="${escapeHtml(task.title || task.url)}">${escapeHtml(task.title || task.url)}</span>
        </div>
        <span class="card-status-badge status-${task.status}">${task.status}</span>
      </div>
      <div class="card-progress-bar">
        <div class="progress-fill" style="width: ${percent}%;"></div>
      </div>
      <div class="card-bottom">
        <span>${task.preset || 'best'}${speed}${eta}</span>
        <div class="card-actions">
          ${
            task.status === 'downloading' || task.status === 'queued' || task.status === 'probing'
              ? `<button class="card-action-btn btn-cancel" data-id="${task.id}">Cancel</button>`
              : ''
          }
        </div>
      </div>
    `

    const cancelBtn = card.querySelector('.btn-cancel')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => cancelTask(task.id))
    }
  })
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]))
}

async function cancelTask(id) {
  try {
    await fetch('/api/cancel', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id}),
    })
    showToast('Download cancelled', 'info')
  } catch (err) {
    showToast('Failed to cancel', 'error')
  }
}

// Server-Sent Events setup
function initSSE() {
  const eventSource = new EventSource('/api/events')

  eventSource.addEventListener('init', e => {
    const data = JSON.parse(e.data)
    queueStats = data.stats
    renderQueueCards(data.tasks)
  })

  eventSource.addEventListener('task:added', e => {
    const task = JSON.parse(e.data)
    currentTasks.push(task)
    renderQueueCards(currentTasks)
  })

  eventSource.addEventListener('task:update', e => {
    const task = JSON.parse(e.data)
    const idx = currentTasks.findIndex(t => t.id === task.id)
    if (idx !== -1) currentTasks[idx] = task
    else currentTasks.push(task)
    renderQueueCards(currentTasks)
  })

  eventSource.addEventListener('task:complete', e => {
    const task = JSON.parse(e.data)
    showToast(`✓ Yoinked: ${task.title || 'Video'}`, 'success')
  })

  eventSource.addEventListener('task:error', e => {
    const data = JSON.parse(e.data)
    showToast(`✗ Failed: ${data.url} (${data.error})`, 'error')
  })

  eventSource.addEventListener('queue:progress', e => {
    queueStats = JSON.parse(e.data)
    renderQueueCards(currentTasks)
  })

  eventSource.addEventListener('queue:drain', e => {
    const summary = JSON.parse(e.data)
    showToast(`Batch completed: ${summary.completed} downloaded out of ${summary.total}`, 'success')
  })
}

// Theme
themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme')
  const next = current === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('yoinks_theme', next)
})

const savedTheme = localStorage.getItem('yoinks_theme')
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme)
}

// Init
initSSE()
updateInputState()
