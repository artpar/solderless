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
await new Promise(r => setTimeout(r, 2000))

// Read chrome-connect source files
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

const files = readDir(projectDir)
console.log(`Loaded ${files.length} source files`)

// Render zoomed into a corner to see labels
await page.evaluate(async (filesJson) => {
  const { buildProjectCircuit } = await import('/src/analysis/project-circuit.ts')
  const { layoutBoard } = await import('/src/layout/layout.ts')
  const { render, createDefaultRenderState } = await import('/src/renderer/renderer.ts')

  const files = JSON.parse(filesJson)
  const board = buildProjectCircuit(files, 'chrome-connect')
  const positioned = layoutBoard(board)

  const canvas = document.querySelector('canvas')
  if (canvas) {
    // Zoom to show a portion with readable labels
    const state = {
      ...createDefaultRenderState(),
      zoom: 0.6,
      panX: -200,
      panY: -50,
    }
    render(canvas, positioned, state)
  }
}, JSON.stringify(files))

await new Promise(r => setTimeout(r, 1000))
await page.screenshot({ path: '/tmp/ast-map-project-zoom.png', fullPage: false })

// Also take a zoomed-in detail shot
await page.evaluate(async (filesJson) => {
  const { buildProjectCircuit } = await import('/src/analysis/project-circuit.ts')
  const { layoutBoard } = await import('/src/layout/layout.ts')
  const { render, createDefaultRenderState } = await import('/src/renderer/renderer.ts')

  const files = JSON.parse(filesJson)
  const board = buildProjectCircuit(files, 'chrome-connect')
  const positioned = layoutBoard(board)

  const canvas = document.querySelector('canvas')
  if (canvas) {
    const state = {
      ...createDefaultRenderState(),
      zoom: 1.5,
      panX: -400,
      panY: 100,
    }
    render(canvas, positioned, state)
  }
}, JSON.stringify(files))

await new Promise(r => setTimeout(r, 500))
await page.screenshot({ path: '/tmp/ast-map-project-detail.png', fullPage: false })

console.log('\n=== CONSOLE LOGS ===')
for (const log of consoleLogs) console.log(log)

await browser.close()
