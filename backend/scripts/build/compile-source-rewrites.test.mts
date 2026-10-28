import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { rewriteModuleSource } from './compile-source-rewrites.mts'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const repoModule = path.join(repoRoot, 'backend/modules/utils/example.mts')
const embeddedDir = '/$bunfs/root/src/backend/modules/utils'

function packageModule(relativePath: string): string {
  return path.join(repoRoot, 'node_modules/.pnpm/pkg/node_modules', relativePath)
}

describe('rewriteModuleSource', () => {
  it('awaits async modules reached through export star by importing them first', () => {
    expect(rewriteModuleSource("export * from './clients.mts'\n", repoModule)).toBe(
      "import './clients.mts'; export * from './clients.mts';\n",
    )
  })

  it('drops a createRequire alias so the bundler follows the requires', () => {
    const source = "const require = createRequire(import.meta.url);\nrequire('pg-cursor')\n"
    expect(rewriteModuleSource(source, packageModule('lib/index.mjs'))).toBe(
      "\nrequire('pg-cursor')\n",
    )
  })

  it('points undici imports at the installed package instead of the Bun built-in', () => {
    const rewritten = rewriteModuleSource("import { Agent } from 'undici'\n", repoModule)
    expect(rewritten).toMatch(/^import \{ Agent \} from '\/.+\/node_modules\/undici\/index\.js'\n$/)
  })

  it('gives repository modules their embedded repository path', () => {
    const source =
      "readFileSync(new URL('./scripts/a.lua', import.meta.url))\nimport.meta.dirname\n"
    expect(rewriteModuleSource(source, repoModule)).toBe(
      `readFileSync(new URL('./scripts/a.lua', "file://${embeddedDir}/example.mts"))\n` +
        `"${embeddedDir}"\n`,
    )
  })

  it('leaves package modules outside the rewritten packages on their own paths', () => {
    const source = 'import.meta.url\n__dirname\n'
    expect(rewriteModuleSource(source, packageModule('other/index.js'))).toBe(source)
  })

  it('shadows __dirname in rewritten CommonJS packages without touching strings', () => {
    const modulePath = packageModule('@glidemq/dashboard/dist/index.js')
    const embedded = `/$bunfs/root/src/${path.relative(repoRoot, modulePath)}`
    const source = '"use strict";\nread(__dirname, "see __dirname")\n'
    expect(rewriteModuleSource(source, modulePath)).toBe(
      '"use strict";\n' +
        `var __dirname = "${path.dirname(embedded)}", __filename = "${embedded}";\n` +
        'read(__dirname, "see __dirname")\n',
    )
  })

  it('bundles the JSON manifests playwright-core requires by computed path', () => {
    const modulePath = packageModule('playwright-core/lib/coreBundle.js')
    const source = 'x = require(import_path8.default.join(packageRoot, "package.json"));\n'
    expect(rewriteModuleSource(source, modulePath)).toBe('x = require("../package.json");\n')
    expect(() => rewriteModuleSource('x = 1\n', modulePath)).toThrow(/package JSON/)
  })
})
