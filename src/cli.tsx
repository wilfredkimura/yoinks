import React from 'react'
import {createRequire} from 'node:module'
import {render} from 'ink'
import {App, type Outcome} from './app.js'
import {captureFrames} from './lib/click-map.js'
import {parseArgs, readBatchFile} from './lib/args.js'
import {readClipboard} from './lib/clipboard.js'
import {isProbablyUrl} from './lib/platforms.js'
import {BatchQueue} from './lib/queue.js'
import {runHeadless} from './lib/headless.js'

// read at runtime from the shipped package.json so npm version bumps
// can't drift from a hardcoded constant
const VERSION: string = createRequire(import.meta.url)('../package.json').version

const HELP = `
  yoinks — yoink any video. paste. yoink. done.

  Usage
    $ yoinks [url...]

  Examples
    $ yoinks https://youtu.be/dQw4w9WgXcQ
    $ yoinks https://youtu.be/vid1 https://youtu.be/vid2
    $ yoinks -b links.txt
    $ yoinks --best https://youtu.be/dQw4w9WgXcQ
    $ yoinks --mp3 -b playlist.txt -o ~/Music
    $ yoinks                 (prompts for a url)

  Options
    -b, --batch <file>      batch download urls from a text file
    -o, --output <dir>      custom download directory
    --best                  download best video quality without picker
    --mp3                   extract best audio as mp3 without picker
    --preset <value>        preset quality (e.g. 1080p, 720p, mp3)
    -c, --concurrency <n>   number of parallel downloads (default: 2)
    --headless              run in non-interactive headless mode
    --gui                   launch the web gui
    --tui                   force terminal interactive mode
    --theme <mode>          use auto, light, or dark for this run
    -h, --help              show this help
    -v, --version           show version

  Downloads are saved to ~/Downloads by default.
  Powered by yt-dlp — YouTube, X, Instagram, Threads, TikTok & 1800+ sites.
`

const args = parseArgs(process.argv.slice(2))

if (args.error) {
  console.error(`yoinks: ${args.error}\nTry “yoinks --help” for usage.`)
  process.exit(1)
}

if (args.help) {
  console.log(HELP)
  process.exit(0)
}

if (args.version) {
  console.log(VERSION)
  process.exit(0)
}

const urls = [...args.urls]
if (args.batchFile) {
  try {
    urls.push(...readBatchFile(args.batchFile))
  } catch (err: unknown) {
    console.error(`yoinks: failed to read batch file “${args.batchFile}”: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

const initialUrl = urls[0]
const initialThemeMode = args.themeMode ?? 'auto'
const isTTY = Boolean(process.stdout.isTTY)

// Headless scriptable execution check
const shouldUseHeadless =
  args.headless ||
  (!isTTY && urls.length > 0) ||
  (urls.length > 0 && (args.best || args.mp3))

if (shouldUseHeadless) {
  const queue = new BatchQueue({
    concurrency: args.concurrency,
    outDir: args.outputDir,
    defaultPreset: args.preset ?? (args.mp3 ? 'mp3' : 'best'),
  })
  queue.enqueue(urls)
  const result = await runHeadless(queue)
  process.exit(result.failed > 0 ? 1 : 0)
}

// Interactive TUI execution
let clipboardUrl: string | undefined
if (!initialUrl && isTTY) {
  const clipped = readClipboard().trim()
  if (clipped && !/\s/.test(clipped) && isProbablyUrl(clipped)) clipboardUrl = clipped
}

const enterAltScreen = () => process.stdout.write('\x1b[?1049h\x1b[H')
const leaveAltScreen = () => process.stdout.write('\x1b[?1006l\x1b[?1000l\x1b[?1049l')

if (isTTY) {
  enterAltScreen()
  process.on('exit', leaveAltScreen)
  for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
    process.on(event, (error: unknown) => {
      leaveAltScreen()
      console.error(error)
      process.exit(1)
    })
  }
}

let outcome: Outcome = {}
const {waitUntilExit} = render(
  <App
    initialUrl={initialUrl}
    urls={urls.length > 1 ? urls : undefined}
    outDir={args.outputDir}
    preset={args.preset}
    concurrency={args.concurrency}
    clipboardUrl={clipboardUrl}
    initialThemeMode={initialThemeMode}
    onOutcome={result => (outcome = result)}
  />,
  {stdout: captureFrames(process.stdout)},
)

await waitUntilExit()

if (isTTY) leaveAltScreen()
if (outcome.filepath) {
  console.log(`✓ yoinked → ${outcome.filepath}`)
} else if (outcome.batchSummary) {
  console.log(
    `✓ yoinked batch: ${outcome.batchSummary.completed} downloaded out of ${outcome.batchSummary.total}`,
  )
}
