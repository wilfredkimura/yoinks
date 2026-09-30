import {detectPlatform, isProbablyUrl, type Platform} from '../../lib/platforms.js'

export type ParsedLink = {
  url: string
  platform: Platform
}

/**
 * Extracts all valid HTTP/HTTPS URLs from raw multi-line text, space-separated lists,
 * or comma-separated lists. Deduplicates while preserving input order.
 */
export function extractUrlsFromText(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return []

  // Match URLs including those embedded in surrounding text or markdown links
  const urlRegex = /https?:\/\/[^\s"'<>()[\]{}]+[^\s"'<>()[\]{},.:;?!]/gi
  const matches = rawText.match(urlRegex) ?? []

  const seen = new Set<string>()
  const validUrls: string[] = []

  for (const match of matches) {
    const trimmed = match.trim()
    if (isProbablyUrl(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed)
      validUrls.push(trimmed)
    }
  }

  // Also check if any lines that were pure URLs but might not match regex were missed
  const lines = rawText.split(/[\r\n]+/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (isProbablyUrl(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed)
      validUrls.push(trimmed)
    }
  }

  return validUrls
}

/**
 * Parses URLs and detects their platform metadata (YouTube, X, TikTok, Instagram, etc.)
 */
export function parseLinksWithPlatforms(rawText: string): ParsedLink[] {
  const urls = extractUrlsFromText(rawText)
  return urls.map(url => ({
    url,
    platform: detectPlatform(url),
  }))
}
