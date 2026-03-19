import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

const browser = await puppeteer.launch({
  headless: false,
  defaultViewport: { width: 1920, height: 1080 },
})

const page = await browser.newPage()

const consoleLogs = []
page.on('console', msg => {
  consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
})
page.on('pageerror', err => {
  consoleLogs.push(`[PAGE ERROR] ${err.message}`)
})

await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 3000))

// Take initial screenshot — shows default code rendered via Phaser
await page.screenshot({ path: '/tmp/ast-map-phaser-default.png', fullPage: false })
console.log('Saved default view to /tmp/ast-map-phaser-default.png')

// Check for Phaser canvas
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  if (!canvas) return null
  return { width: canvas.width, height: canvas.height }
})
console.log('Canvas:', canvasInfo)

// Read chrome-connect source files for project test
const projectDir = '/Users/artpar/workspace/code/insidious/chrome-connect/src'
const EXTS = ['.ts', '.tsx', '.js', '.jsx']
const SKIP = ['node_modules', '.git', 'dist', 'build', '__tests__']

function readDir(dir, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (SKIP.includes(entry.name)) continue
      files.push(...readDir(path.join(dir, entry.name), rel))
    } else {
      const ext = path.extname(entry.name)
      if (!EXTS.includes(ext)) continue
      const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
      files.push({ path: rel, name: entry.name, content })
    }
  }
  return files
}

let files
try {
  files = readDir(projectDir)
  console.log(`Loaded ${files.length} source files`)
} catch (e) {
  console.log('Project dir not found, skipping project test')
  files = null
}

// Test project rendering via the analysis pipeline + EventBus
if (files) {
  await page.evaluate(async (filesJson) => {
    const { buildProjectCircuit } = await import('/src/analysis/project-circuit.ts')
    const { layoutBoard } = await import('/src/layout/layout.ts')
    const { EventBus } = await import('/src/phaser/EventBus.ts')
    const { sceneDataRef } = await import('/src/phaser/PhaserGame.tsx')

    const files = JSON.parse(filesJson)
    const board = buildProjectCircuit(files, 'chrome-connect')
    const positioned = layoutBoard(board)

    // Push data through the shared ref + EventBus
    sceneDataRef.positioned = positioned
    sceneDataRef.board = board
    EventBus.emit('board-changed', { positioned, board })
  }, JSON.stringify(files))

  await new Promise(r => setTimeout(r, 3000))
  await page.screenshot({ path: '/tmp/ast-map-project-phaser.png', fullPage: false })
  console.log('Saved project view to /tmp/ast-map-project-phaser.png')
}

console.log('\n=== CONSOLE LOGS ===')
for (const log of consoleLogs) console.log(log)

await browser.close()
