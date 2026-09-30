import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_CONFIG,
  isFirstRun,
  loadConfig,
  saveConfig,
  resolveLaunchMode,
} from './config.js'

test('detects first run state correctly when config file is absent', () => {
  const fakePath = path.join(os.tmpdir(), `yoinks-test-absent-${Date.now()}.json`)
  assert.equal(isFirstRun(fakePath), true)
})

test('loads default config when file does not exist', () => {
  const fakePath = path.join(os.tmpdir(), `yoinks-test-missing-${Date.now()}.json`)
  const config = loadConfig(fakePath)
  assert.equal(config.defaultUi, 'gui')
  assert.equal(config.hasRunBefore, false)
})

test('saves and loads user configuration preferences', () => {
  const fakePath = path.join(os.tmpdir(), `yoinks-test-config-${Date.now()}.json`)
  try {
    saveConfig({defaultUi: 'tui', concurrency: 4}, fakePath)
    assert.equal(isFirstRun(fakePath), false)

    const loaded = loadConfig(fakePath)
    assert.equal(loaded.defaultUi, 'tui')
    assert.equal(loaded.concurrency, 4)
    assert.equal(loaded.hasRunBefore, true)
  } finally {
    try {
      fs.rmSync(fakePath, {force: true})
    } catch {}
  }
})

test('resolves launch mode based on args, first-run status, and TTY', () => {
  // Explicit flag overrides
  assert.equal(resolveLaunchMode({gui: true, urls: []}), 'gui')
  assert.equal(resolveLaunchMode({tui: true, urls: []}), 'tui')
  assert.equal(resolveLaunchMode({headless: true, urls: []}), 'headless')

  // URLs provided in terminal -> tui
  assert.equal(resolveLaunchMode({urls: ['https://youtu.be/test']}, DEFAULT_CONFIG, true), 'tui')
  // URLs provided in non-TTY -> headless
  assert.equal(resolveLaunchMode({urls: ['https://youtu.be/test']}, DEFAULT_CONFIG, false), 'headless')

  // Initial / First run bare launch -> GUI automatically!
  const firstRunConfig = {...DEFAULT_CONFIG, hasRunBefore: false}
  assert.equal(resolveLaunchMode({urls: []}, firstRunConfig, true), 'gui')

  // Subsequent bare launch with defaultUi: 'gui' -> GUI
  const guiConfig = {...DEFAULT_CONFIG, hasRunBefore: true, defaultUi: 'gui' as const}
  assert.equal(resolveLaunchMode({urls: []}, guiConfig, true), 'gui')

  // Subsequent bare launch with defaultUi: 'tui' in terminal -> TUI
  const tuiConfig = {...DEFAULT_CONFIG, hasRunBefore: true, defaultUi: 'tui' as const}
  assert.equal(resolveLaunchMode({urls: []}, tuiConfig, true), 'tui')
})
