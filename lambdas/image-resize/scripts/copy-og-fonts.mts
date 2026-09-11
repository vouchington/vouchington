// og/fonts.mts resolves @fontsource/inter's .woff files at runtime via
// createRequire().resolve() — a call esbuild cannot see statically (see the
// comment in og/fonts.mts for why). That means the font package must be
// physically present under dist/node_modules for the deployed Lambda to find
// it, the same reason build:deps installs sharp's native binary separately
// instead of letting esbuild bundle it.
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FONT_WEIGHTS } from '../og/fonts.mts'

const nodeRequire = createRequire(import.meta.url)
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
