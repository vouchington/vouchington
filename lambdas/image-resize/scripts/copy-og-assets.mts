// Copies the files the OG renderer reads from disk at runtime into dist/. esbuild bundles only
// JavaScript, so these must be physically present in the deployed Lambda, the same reason
// build:deps installs sharp's native binary separately instead of letting esbuild bundle it.
// scripts/tests/smoke-test-deployment-package.mts renders a card from the built zip to prove it.
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FONT_WEIGHTS } from '../og/fonts.mts'

const nodeRequire = createRequire(import.meta.url)

// og/fonts.mts resolves @fontsource/inter's .woff files at runtime via
// createRequire().resolve() — a call esbuild cannot see statically (see the
// comment in og/fonts.mts for why), so the font package goes under dist/node_modules.
const fontPackageJsonPath = nodeRequire.resolve('@fontsource/inter/package.json')
const fontPackageRoot = dirname(fontPackageJsonPath)
const fontPackage = JSON.parse(readFileSync(fontPackageJsonPath, 'utf8')) as {
  name: string
  version: string
  exports: unknown
}

const destRoot = 'dist/node_modules/@fontsource/inter'
mkdirSync(join(destRoot, 'files'), { recursive: true })

// Trimmed package.json: only what Node's exports-map resolution needs.
writeFileSync(
  join(destRoot, 'package.json'),
  JSON.stringify(
    { name: fontPackage.name, version: fontPackage.version, exports: fontPackage.exports },
    null,
    2,
  ),
)

for (const weight of FONT_WEIGHTS) {
  const filename = `inter-latin-${weight}-normal.woff`
  copyFileSync(join(fontPackageRoot, 'files', filename), join(destRoot, 'files', filename))
}

process.stdout.write(
  `Copied ${FONT_WEIGHTS.length} @fontsource/inter font files into ${destRoot}\n`,
)

// satori shapes text with harfbuzzjs, whose emscripten loader reads hb.wasm from the bundle's own
// directory (`__dirname`, which the esbuild.config.mts banner points at dist/) as soon as satori
// is imported. Copy the file that ships with the harfbuzzjs satori resolves, so it matches the
// bundled loader exactly.
const harfbuzzWasmPath = createRequire(nodeRequire.resolve('satori')).resolve('harfbuzzjs/hb.wasm')
copyFileSync(harfbuzzWasmPath, 'dist/hb.wasm')

process.stdout.write('Copied harfbuzzjs hb.wasm into dist\n')
