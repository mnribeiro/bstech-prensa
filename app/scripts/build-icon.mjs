// Gera resources/icon.ico (multi-size) a partir do favicon SVG.
// Rode com: npm run icon
import sharp from 'sharp'
import toIco from 'to-ico'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'resources', 'favicon.svg')
const icoPath = join(root, 'resources', 'icon.ico')

const svg = await readFile(svgPath)
const sizes = [16, 24, 32, 48, 64, 128, 256]

const pngs = await Promise.all(
  sizes.map((s) =>
    sharp(svg).resize(s, s).png().toBuffer()
  )
)

const ico = await toIco(pngs)
await writeFile(icoPath, ico)
console.log(`✓ icon.ico (${sizes.join(',')}px) gerado em ${icoPath}`)
