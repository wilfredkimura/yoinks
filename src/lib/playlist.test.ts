import assert from 'node:assert/strict'
import test from 'node:test'
import {isPlaylistUrl, parseFlatPlaylistJson} from './playlist.js'

test('detects playlist URLs across common formats', () => {
  assert.equal(isPlaylistUrl('https://www.youtube.com/playlist?list=PL12345'), true)
  assert.equal(isPlaylistUrl('https://www.youtube.com/watch?v=abc&list=PL12345'), true)
  assert.equal(isPlaylistUrl('https://soundcloud.com/artist/sets/my-album'), true)
  assert.equal(isPlaylistUrl('https://bandcamp.com/album/super-album'), true)
  assert.equal(isPlaylistUrl('https://www.youtube.com/watch?v=singleVideo'), false)
  assert.equal(isPlaylistUrl('https://x.com/user/status/12345'), false)
})

test('parses flat playlist JSON with direct URLs and YouTube IDs', () => {
  const mockJson = JSON.stringify({
    title: 'Top Hits',
    extractor: 'youtube',
    entries: [
      {id: 'vid1', title: 'Video 1', url: 'https://youtube.com/watch?v=vid1'},
      {id: 'vid2', title: 'Video 2'}, // tests id fallback
      {url: 'https://other.com/video3'},
    ],
  })

  const result = parseFlatPlaylistJson(mockJson)
  assert.equal(result.title, 'Top Hits')
  assert.deepEqual(result.urls, [
    'https://youtube.com/watch?v=vid1',
    'https://www.youtube.com/watch?v=vid2',
    'https://other.com/video3',
  ])
})

test('handles empty or malformed playlist JSON safely', () => {
  assert.throws(() => parseFlatPlaylistJson('not json'), /Failed to parse playlist JSON/)

  const empty = parseFlatPlaylistJson(JSON.stringify({entries: []}))
  assert.deepEqual(empty.urls, [])
})
