import {spawn} from 'node:child_process'

export type PlaylistInfo = {
  title?: string
  urls: string[]
}

const PLAYLIST_PATTERNS = [
  /[?&]list=([a-zA-Z0-9_-]+)/i,
  /\/playlist\?/i,
  /\/sets\//i,
  /\/album\//i,
]

export function isPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return PLAYLIST_PATTERNS.some(pattern => pattern.test(parsed.href))
  } catch {
    return false
  }
}

export function parseFlatPlaylistJson(stdout: string): PlaylistInfo {
  let data: any
  try {
    data = JSON.parse(stdout)
  } catch {
    throw new Error('Failed to parse playlist JSON from yt-dlp.')
  }

  const title = typeof data.title === 'string' ? data.title : undefined
  const urls: string[] = []

  if (Array.isArray(data.entries)) {
    for (const entry of data.entries) {
      if (!entry) continue
      if (typeof entry.url === 'string' && entry.url.startsWith('http')) {
        urls.push(entry.url)
      } else if (typeof entry.id === 'string' && entry.id.length > 0) {
        if (data.extractor_key === 'Youtube' || data.extractor === 'youtube') {
          urls.push(`https://www.youtube.com/watch?v=${entry.id}`)
        } else if (typeof entry.url === 'string') {
          urls.push(entry.url)
        }
      }
    }
  }

  return {title, urls}
}

export async function extractPlaylist(
  ytdlp: string,
  url: string,
  signal?: AbortSignal,
): Promise<PlaylistInfo> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ytdlp,
      ['--flat-playlist', '-J', '--no-warnings', url],
      {signal},
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`))
      } else {
        try {
          resolve(parseFlatPlaylistJson(stdout))
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}
