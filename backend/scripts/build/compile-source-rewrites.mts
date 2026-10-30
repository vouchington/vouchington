// Source rewrites that let the bundled backend run as a Bun standalone executable. Each one
// works around a gap between Bun's bundler and the Node module semantics the sources rely on.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'

export const REPO_ROOT = resolve(import.meta.dirname, '../../..')

export type BunPlugin = {
  name: string
  setup(build: {
    onLoad(
      options: { filter: RegExp },
      callback: (args: { path: string }) => { contents: string; loader: 'js' | 'ts' } | undefined,
    ): void
  }): void
}

// Without --aot, every bundled module shares `import.meta.dir` (`/$bunfs/root`) and an embedded
// directory keeps only its own name. Source files are therefore rewritten to see their
// repository path under this embedded root, and the files they read are staged under it, which
// is the layout `--aot` gives modules and assets natively.
export const EMBEDDED_ROOT_NAME = 'src'
const EMBEDDED_ROOT = `/$bunfs/root/${EMBEDDED_ROOT_NAME}`

// Packages that read their own files at run time. Outside these and the repository's sources,
// a bundled module's `__dirname` is the build machine's path, which the image doesn't have.
const REWRITTEN_PACKAGE_PATHS = [
  '/node_modules/@libpg-query/parser/wasm/',
  '/node_modules/@glidemq/dashboard/dist/',
]

// Bun resolves `undici` to its built-in stand-in (no Agent#close/compose, dispatchers ignored),
// even through a plugin resolver, so import sites are pointed at the installed package's files.
const UNDICI_SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)(['"])undici((?:\/[^'"]*)?)\2/g

function resolveUndici(importer: string, subpath: string): string {
  const packageJson = createRequire(importer).resolve('undici/package.json')
  const root = dirname(packageJson)
  if (subpath) return join(root, subpath)
  const { main } = JSON.parse(readFileSync(packageJson, 'utf8')) as { main?: string }
  return join(root, main ?? 'index.js')
}

const PLAYWRIGHT_PACKAGE_JSON_REQUIRE =
  /require\([\w$]+\.default\.join\(packageRoot, "([\w.-]+\.json)"\)\)/g

export function rewriteModuleSource(source: string, modulePath: string): string {
  let rewritten = source
    // Bun's bundler does not await an async module reached through `export * from` (linker
    // convertStmtsForChunk emits its init call without await). A preceding side-effect import
    // takes the awaited path, so top-level-await graphs initialize in order. Still needed by
    // the repository's own barrels (data-stores/valkey and data-stores/psql `export * from
    // './clients.mts'`, whose clients are created with top-level await).
    .replace(/^export \* from (['"][^'"]+['"]);?$/gm, 'import $1; export * from $1;')
    // The bundler can't follow requires made through createRequire (sharp's addon,
    // @vouchington/postgres's pg-cursor); Bun's own `require` in ESM is followed and embedded.
    .replace(/^const require = createRequire\(import\.meta\.url\);?$/m, '')
  // playwright-core requires its own JSON manifests through a computed path, which would load
  // them from the build machine; the relative form is bundled.
  if (modulePath.endsWith('/node_modules/playwright-core/lib/coreBundle.js')) {
    const before = rewritten
    rewritten = rewritten.replace(PLAYWRIGHT_PACKAGE_JSON_REQUIRE, 'require("../$1")')
    if (rewritten === before)
      throw new Error('playwright-core no longer requires its package JSON by path')
  }
  if (rewritten.includes('undici')) {
    rewritten = rewritten.replace(
      UNDICI_SPECIFIER,
      (_match, prefix: string, quote: string, subpath: string) =>
        `${prefix}${quote}${resolveUndici(modulePath, subpath)}${quote}`,
    )
  }
  if (!usesRepositoryLayout(modulePath)) return rewritten
  const embeddedPath = `${EMBEDDED_ROOT}/${relative(REPO_ROOT, modulePath)}`
  // CommonJS package files: shadow the module-scoped bindings after any directive prologue, so
  // strings that merely mention `__dirname` stay as they are and strict mode is kept.
  if (modulePath.includes('/node_modules/') && /\b__(?:dir|file)name\b/.test(rewritten)) {
    const declaration =
      `var __dirname = ${JSON.stringify(dirname(embeddedPath))}, ` +
      `__filename = ${JSON.stringify(embeddedPath)};\n`
    const prologue = /^(?:\s*(['"])use strict\1;?[^\S\n]*\n)?/.exec(rewritten)?.[0] ?? ''
    rewritten = prologue + declaration + rewritten.slice(prologue.length)
  }
  return rewritten
    .replaceAll('import.meta.dirname', JSON.stringify(dirname(embeddedPath)))
    .replaceAll('import.meta.filename', JSON.stringify(embeddedPath))
    .replaceAll('import.meta.url', JSON.stringify(`file://${embeddedPath}`))
}

function usesRepositoryLayout(modulePath: string): boolean {
  if (!modulePath.startsWith(`${REPO_ROOT}/`)) return false
  if (!relative(REPO_ROOT, modulePath).split('/').includes('node_modules')) return true
  return REWRITTEN_PACKAGE_PATHS.some(path => modulePath.includes(path))
}

export const sourceRewritePlugin: BunPlugin = {
  name: 'voucha-compiled-module-layout',
  setup(build) {
    build.onLoad({ filter: /\.(?:mts|cts|ts|mjs|cjs|js)$/ }, args => {
      const source = readFileSync(args.path, 'utf8')
      const contents = rewriteModuleSource(source, args.path)
      if (contents === source) return undefined
      return { contents, loader: /\.[mc]?ts$/.test(args.path) ? 'ts' : 'js' }
    })
  },
}
