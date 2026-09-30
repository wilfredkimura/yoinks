import assert from 'node:assert/strict'
import test from 'node:test'
import {extractUrlsFromText, parseLinksWithPlatforms} from './parser.js'

test('extracts multiple URLs from line-delimited text and deduplicates', () => {
  const text = `
    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    https://x.com/user/status/123456
    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    https://tiktok.com/@creator/video/98765
  `
  const urls = extractUrlsFromText(text)
  assert.equal(urls.length, 3)
  assert.equal(urls[0], 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(urls[1], 'https://x.com/user/status/123456')
  assert.equal(urls[2], 'https://tiktok.com/@creator/video/98765')
})

test('extracts URLs embedded within sentence text or comma separated lists', () => {
  const text = 'Check these out: https://youtu.be/video1, also https://instagram.com/p/abc and https://threads.net/@user/post/xyz!'
  const urls = extractUrlsFromText(text)
  assert.deepEqual(urls, [
    'https://youtu.be/video1',
    'https://instagram.com/p/abc',
    'https://threads.net/@user/post/xyz',
  ])
})

test('tags parsed links with their corresponding platform metadata', () => {
  const text = `
    https://youtu.be/abc
    https://twitter.com/test/status/123
    https://reddit.com/r/videos/comments/xyz
  `
  const links = parseLinksWithPlatforms(text)
  assert.equal(links.length, 3)
  assert.equal(links[0]?.platform.key, 'youtube')
  assert.equal(links[1]?.platform.key, 'x')
  assert.equal(links[2]?.platform.key, 'reddit')
})

test('returns empty array when text has no valid URLs', () => {
  assert.deepEqual(extractUrlsFromText(''), [])
  assert.deepEqual(extractUrlsFromText('just some random words without links'), [])
})
