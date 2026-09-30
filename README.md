# yoinks

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo-light.svg" alt="yoinks" width="288">
</picture>

yoink any video. paste. yoink. done.

Download videos from YouTube, X/Twitter, Instagram, Threads, TikTok and
1,800+ other sites — right from your terminal or modern Web GUI. Paste links,
pick resolutions (or audio-only mp3), done. No popups, no fake download buttons,
no sketchy redirects.

<img src="assets/home.png" alt="yoinks home screen — paste a link and hit yoink" width="100%">

## Install

```sh
npm install -g yoinks
```

Or try it without installing anything:

```sh
npx yoinks
```

Requires Node 18+. Everything else (yt-dlp, ffmpeg) is fetched or bundled
automatically.

## Usage

### Web GUI (Auto-Setup on Initial Run)

Running `yoinks` initially without arguments automatically initializes your environment and launches the built-in **Web GUI** in your default browser:

```sh
$ yoinks                  # initial run auto-sets up and opens the Web GUI
$ yoinks --gui            # explicitly launch the Web GUI anytime
```

Features of the Web GUI:
- **Smart Multi-Link Input:** Paste 1 or dozens of links separated by newlines or spaces.
- **Drag & Drop:** Drop `.txt` files containing links directly into the box.
- **Presets:** One-click batch presets (`Best Video MP4`, `1080p`, `720p`, `MP3 Audio`).
- **Live Progress:** Real-time download speeds, ETAs, progress bars, and cancel controls powered by Server-Sent Events (SSE).

### Terminal UI (Interactive TUI)

```sh
$ yoinks https://youtu.be/dQw4w9WgXcQ    # straight to format picker
$ yoinks https://youtu.be/1 https://youtu.be/2 # batch download queue in TUI
$ yoinks --tui                           # force terminal interactive mode
$ yoinks --theme light                   # force the light palette
```

yoinks takes over the terminal (full-screen, centered — and restores your
scrollback on exit). Pick a format with ↑/↓ (or j/k, or number keys) and
hit enter. `esc` goes back, `^c` quits. Or just use the mouse — the yoink
button, the format list and the footer hints are all clickable. Files are saved to `~/Downloads`,
and the file path is printed to your terminal when you're done.

<img src="assets/download-options.png" alt="yoinks format picker — resolutions with estimated file sizes, plus audio-only mp3" width="100%">

### Batch & Scriptable Headless Mode

Automate bulk downloads or pipe into scripts without interactive prompts:

```sh
# Batch download from a text file:
$ yoinks -b links.txt

# Download best quality without prompts:
$ yoinks --best https://youtu.be/dQw4w9WgXcQ

# Extract best audio to MP3 into a custom folder:
$ yoinks --mp3 -b album.txt -o ~/Music

# Controlled concurrency:
$ yoinks -b links.txt --concurrency 3
```

## Options

```
Options:
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
```

## How it works

- Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp). On first run,
  yoinks downloads the standalone yt-dlp binary to `~/.yoinks/bin` —
  no Python required. If you already have yt-dlp installed, it uses yours.
- ffmpeg (needed for merging high-res streams and mp3 extraction) is found
  on your PATH, with `ffmpeg-static` as a bundled fallback.
- The terminal UI is [Ink](https://github.com/vadimdemedes/ink) — React for the terminal.
- The Web GUI is a zero-dependency embedded Node HTTP & Server-Sent Events (SSE) server serving a modern responsive dashboard.

## Development

```sh
npm install
npm run build        # bundle to dist/ with tsup
npm run dev          # rebuild on change
npm test             # run all unit and e2e smoke tests
npm run typecheck    # typecheck with tsc
node dist/cli.js <url>
```

To try it as a global command without publishing: `npm link`, then run
`yoinks` anywhere.

## Roadmap

- [x] Batch downloads of links (`yoinks <url1> <url2>...`)
- [x] Batch file input (`yoinks -b links.txt`)
- [x] Built-in Web GUI (`yoinks --gui`) with auto-setup on initial run
- [x] `--best` / `--mp3` flags to skip the picker (scriptable mode)
- [x] `-o <dir>` to choose the output folder
- [x] Playlist / thread-with-multiple-videos support
- [x] Clipboard detection: launch bare and auto-suggest the url you copied
- [x] Publish to npm (`npm i -g yoinks` / `npx yoinks`)
- [ ] Self-update for the bundled yt-dlp binary (`yt-dlp -U`)
- [ ] `curl yoinks.sh | sh` installer

## A note on fair use

yoinks is a personal-archiving tool. Downloading content may violate a
platform's terms of service — only download what you have the right to
keep, and be excellent to creators.

## License

[MIT](LICENSE)
