import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {BatchQueue, type DownloadTask} from '../lib/queue.js'
import {loadConfig, saveConfig, type UserConfig} from '../lib/config.js'
import {probe, ensureYtDlp, findFfmpeg} from '../lib/ytdlp.js'
import {isProbablyUrl} from '../lib/platforms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type GuiServerOptions = {
  port?: number
  staticDir?: string
  queue?: BatchQueue
  config?: UserConfig
}

export type GuiServerInstance = {
  server: http.Server
  port: number
  url: string
  queue: BatchQueue
  close: () => Promise<void>
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'))
      }
    })
    req.on('end', () => {
      if (!body.trim()) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON payload'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
  const json = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(json)
}

export function startGuiServer(options: GuiServerOptions = {}): Promise<GuiServerInstance> {
  const startPort = options.port ?? 5252
  const staticDir = options.staticDir ?? path.join(__dirname, 'client')
  const userConfig = options.config ?? loadConfig()
  const queue =
    options.queue ??
    new BatchQueue({
      outDir: userConfig.outDir,
      defaultPreset: userConfig.defaultPreset,
      concurrency: userConfig.concurrency,
    })

  const sseClients = new Set<http.ServerResponse>()

  const broadcast = (event: string, data: any) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of sseClients) {
      try {
        client.write(message)
      } catch {
        sseClients.delete(client)
      }
    }
  }

  // Hook queue events to SSE stream
  queue.on('task:added', task => broadcast('task:added', task))
  queue.on('task:update', task => broadcast('task:update', task))
  queue.on('task:complete', task => broadcast('task:complete', task))
  queue.on('task:error', (task, err) =>
    broadcast('task:error', {
      id: task.id,
      url: task.url,
      error: err instanceof Error ? err.message : String(err),
    }),
  )
  queue.on('queue:progress', stats => broadcast('queue:progress', stats))
  queue.on('queue:drain', summary => broadcast('queue:drain', summary))

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`)
    const pathname = parsedUrl.pathname
    const method = req.method?.toUpperCase() ?? 'GET'

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }

    // API Routes
    if (pathname.startsWith('/api/')) {
      try {
        if (pathname === '/api/status' && method === 'GET') {
          let ytdlpOk = false
          let ffmpegOk = false
          try {
            await ensureYtDlp(() => {})
            ytdlpOk = true
          } catch {}
          try {
            const ff = await findFfmpeg()
            ffmpegOk = Boolean(ff)
          } catch {}

          sendJson(res, 200, {
            status: 'online',
            ytdlpReady: ytdlpOk,
            ffmpegReady: ffmpegOk,
            config: loadConfig(),
            stats: queue.getStats(),
            tasks: queue.getTasks(),
          })
          return
        }

        if (pathname === '/api/batch' && method === 'POST') {
          const body = await parseJsonBody(req)
          const urls = Array.isArray(body.urls) ? body.urls : []
          const preset = typeof body.preset === 'string' ? body.preset : undefined
          const outDir = typeof body.outDir === 'string' ? body.outDir : undefined

          if (urls.length === 0) {
            sendJson(res, 400, {error: 'urls array cannot be empty'})
            return
          }

          const added = queue.enqueue(urls, {preset, outDir})
          queue.start()

          sendJson(res, 200, {
            added: added.length,
            tasks: added,
            stats: queue.getStats(),
          })
          return
        }

        if (pathname === '/api/probe' && method === 'POST') {
          const body = await parseJsonBody(req)
          const url = typeof body.url === 'string' ? body.url.trim() : ''

          if (!url || !isProbablyUrl(url)) {
            sendJson(res, 400, {error: 'A valid URL is required'})
            return
          }

          const ytdlp = await ensureYtDlp(() => {})
          const probeResult = await probe(ytdlp, url)
          sendJson(res, 200, {
            title: probeResult.info.title,
            duration: probeResult.info.duration,
            uploader: probeResult.info.uploader,
            formats: probeResult.info.formats?.length ?? 0,
          })
          return
        }

        if (pathname === '/api/cancel' && method === 'POST') {
          const body = await parseJsonBody(req)
          const id = typeof body.id === 'string' ? body.id : undefined

          if (id) {
            const cancelled = queue.cancel(id)
            sendJson(res, 200, {cancelled, id})
          } else {
            queue.cancelAll()
            sendJson(res, 200, {cancelledAll: true})
          }
          return
        }

        if (pathname === '/api/settings' && method === 'POST') {
          const body = await parseJsonBody(req)
          const updated = saveConfig(body)
          sendJson(res, 200, {config: updated})
          return
        }

        if (pathname === '/api/events' && method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          })
          res.write(`event: init\ndata: ${JSON.stringify({stats: queue.getStats(), tasks: queue.getTasks()})}\n\n`)

          sseClients.add(res)
          req.on('close', () => {
            sseClients.delete(res)
          })
          return
        }

        sendJson(res, 404, {error: `Unknown API route: ${pathname}`})
        return
      } catch (err: unknown) {
        sendJson(res, 500, {error: err instanceof Error ? err.message : String(err)})
        return
      }
    }

    // Static Asset Serving
    let filePath = path.join(staticDir, pathname === '/' ? 'index.html' : pathname)
    if (!filePath.startsWith(staticDir)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    // If static file doesn't exist, fallback to index.html for SPA routing
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(staticDir, 'index.html')
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'
      res.writeHead(200, {'Content-Type': contentType})
      fs.createReadStream(filePath).pipe(res)
    } else {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'})
      res.end('yoinks web gui: static assets not found. Build the frontend or check staticDir.')
    }
  })

  return new Promise((resolve, reject) => {
    let currentPort = startPort

    const tryListen = () => {
      server.listen(currentPort, 'localhost', () => {
        const url = `http://localhost:${currentPort}`
        resolve({
          server,
          port: currentPort,
          url,
          queue,
          close: () =>
            new Promise<void>(resClose => {
              for (const client of sseClients) {
                try {
                  client.end()
                } catch {}
              }
              sseClients.clear()
              server.close(() => resClose())
            }),
        })
      })
    }

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        currentPort++
        if (currentPort - startPort < 50) {
          tryListen()
        } else {
          reject(new Error(`Could not find an available port between ${startPort} and ${currentPort}`))
        }
      } else {
        reject(err)
      }
    })

    tryListen()
  })
}
