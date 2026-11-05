import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sourceRewritePlugin, type BunPlugin } from './compile-source-rewrites.mts'

describe('rewriteModuleSource', () => {
  let fixtureRoot: string
  let repoModule: string
  const embeddedDir = '/$bunfs/root/src/backend/modules/utils'
  let onLoad: Parameters<Parameters<BunPlugin['setup']>[0]['onLoad']>[1]

  beforeAll(() => {
    fixtureRoot = mkdtempSync(
      path.join(process.env.RUNNER_TEMP || tmpdir(), 'source-rewrite-test-'),
    )
    const nodeModules = path.join(fixtureRoot, 'node_modules')
    mkdirSync(nodeModules)
    symlinkSync(
      path.dirname(createRequire(import.meta.url).resolve('undici/package.json')),
      path.join(nodeModules, 'undici'),
      'dir',
    )
    repoModule = path.join(fixtureRoot, 'backend/modules/utils/example.mts')
    sourceRewritePlugin.setup(
      {
        onLoad(_options, callback) {
          onLoad = callback
        },
      },
      fixtureRoot,
    )
  })

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
  })

  function loadFixture(source: string, modulePath: string): string {
    mkdirSync(path.dirname(modulePath), { recursive: true })
    writeFileSync(modulePath, source)
    return onLoad({ path: modulePath })?.contents ?? source
  }

  function packageModule(relativePath: string): string {
    return path.join(fixtureRoot, 'node_modules/.pnpm/pkg/node_modules', relativePath)
  }

  it('drops a createRequire alias so the bundler follows the requires', () => {
    const source =
      "const require = createRequire(import.meta.url);\nrequire('../build/Release/sharp.node')\n"
    expect(loadFixture(source, packageModule('dist/sharp.mjs'))).toBe(
      "\nrequire('../build/Release/sharp.node')\n",
    )
  })

  it('points undici imports at the installed package instead of the Bun built-in', () => {
    const rewritten = loadFixture("import { Agent } from 'undici'\n", repoModule)
    expect(rewritten).toMatch(/^import \{ Agent \} from '\/.+\/node_modules\/undici\/index\.js'\n$/)
  })

  it('gives repository modules their embedded repository path', () => {
    const source =
      "readFileSync(new URL('./scripts/a.lua', import.meta.url))\nimport.meta.dirname\n"
    expect(loadFixture(source, repoModule)).toBe(
      `readFileSync(new URL('./scripts/a.lua', "file://${embeddedDir}/example.mts"))\n` +
        `"${embeddedDir}"\n`,
    )
  })

  it('leaves package modules outside the rewritten packages on their own paths', () => {
    const source = 'import.meta.url\n__dirname\n'
    expect(loadFixture(source, packageModule('other/index.js'))).toBe(source)
  })

  it('shadows __dirname in rewritten CommonJS packages without touching strings', () => {
    const modulePath = packageModule('@glidemq/dashboard/dist/index.js')
    const embedded = `/$bunfs/root/src/${path.relative(fixtureRoot, modulePath)}`
    const source = '"use strict";\nread(__dirname, "see __dirname")\n'
    expect(loadFixture(source, modulePath)).toBe(
      '"use strict";\n' +
        `var __dirname = "${path.dirname(embedded)}", __filename = "${embedded}";\n` +
        'read(__dirname, "see __dirname")\n',
    )
  })

  it('bundles the JSON manifests playwright-core requires by computed path', () => {
    const modulePath = packageModule('playwright-core/lib/coreBundle.js')
    const source = 'x = require(import_path8.default.join(packageRoot, "package.json"));\n'
    expect(loadFixture(source, modulePath)).toBe('x = require("../package.json");\n')
    expect(() => loadFixture('x = 1\n', modulePath)).toThrow(/package JSON/)
  })
})
