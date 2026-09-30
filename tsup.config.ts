import {defineConfig} from 'tsup'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: 'esm',
  target: 'node18',
  clean: true,
  banner: {js: '#!/usr/bin/env node'},
  onSuccess: async () => {
    const srcDir = path.resolve('src/gui/client')
    const destDir = path.resolve('dist/gui/client')
    fs.mkdirSync(destDir, {recursive: true})
    fs.cpSync(srcDir, destDir, {recursive: true})
  },
})
