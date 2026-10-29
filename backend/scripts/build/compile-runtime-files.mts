// Files the compiled executables read at run time: embedded data files and the shared
// libraries the image installs beside them.
import { copyFileSync, globSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { REPO_ROOT } from './compile-source-rewrites.mts'

// Files read at run time through `import.meta`-relative paths. TypeScript modules among them
// are imported by path (fixed and config-driven migrations), so each is bundled on its own.
const RUNTIME_FILE_GLOBS = [
  'backend/**/scripts/*.lua',
  'node_modules/.pnpm/valkyries@*/node_modules/valkyries/dist/scripts/*.lua',
  'backend/data-stores/psql/migrations/*.{sql,mts}',
  'backend/data-stores/psql/views/*.sql',
  'backend/data-stores/psql/config-driven/*.{sql,mts}',
  'backend/data-stores/psql/schema-snapshot/schema.json',
  'node_modules/.pnpm/@libpg-query+parser@*/node_modules/@libpg-query/parser/wasm/libpg-query.wasm',
  'node_modules/.pnpm/@glidemq+dashboard@*/node_modules/@glidemq/dashboard/dist/dashboard-ui.html',
]
const RUNTIME_FILE_EXCLUDES = ['**/node_modules/**/backend/**', '**/*.test.mts', '**/*.d.mts']

type BundleModule = (entry: string, outdir: string) => Promise<string>

export async function stageRuntimeFiles(stagingRoot: string, bundle: BundleModule): Promise<void> {
  const files = globSync(RUNTIME_FILE_GLOBS, { cwd: REPO_ROOT, exclude: RUNTIME_FILE_EXCLUDES })
  if (files.length === 0) throw new Error('No runtime files matched; is the workspace installed?')
  for (const file of files) {
    const target = join(stagingRoot, file)
    mkdirSync(dirname(target), { recursive: true })
    if (!file.endsWith('.mts')) {
      copyFileSync(join(REPO_ROOT, file), target)
      continue
    }
    // Imported by path at run time, outside the bundle's module graph: ship it self-contained.
    const outdir = mkdtempSync(join(tmpdir(), 'voucha-runtime-module-'))
    try {
      copyFileSync(await bundle(join(REPO_ROOT, file), outdir), target)
    } finally {
      rmSync(outdir, { recursive: true, force: true })
    }
  }
}

// Native addons are embedded, but some load shared libraries that ship beside them. An embedded
// addon runs from a temporary copy, so the image puts these on LD_LIBRARY_PATH: libduckdb and
// libvips-cpp are linked, and vurst-ai dlopens libonnxruntime.so by name at its first inference
// (its package path probe can't see the embedded file).
const SHARED_LIBRARIES = ['libduckdb.so', 'libvips-cpp.so.*', 'libonnxruntime.so'] as const

export function copySharedLibraries(outDir: string): void {
  const platform = `${process.platform}-${process.arch}`
  const libraries = globSync(
    [
      `node_modules/.pnpm/@duckdb+node-bindings-${platform}@*/node_modules/@duckdb/node-bindings-${platform}/libduckdb.so`,
      `node_modules/.pnpm/@img+sharp-libvips-${platform}@*/node_modules/@img/sharp-libvips-${platform}/lib/libvips-cpp.so.*`,
      `node_modules/.pnpm/@jongleberry+vurst-ai-${platform}-gnu@*/node_modules/@jongleberry/vurst-ai-${platform}-gnu/onnxruntime/libonnxruntime.so`,
    ],
    { cwd: REPO_ROOT },
  )
  const missing = SHARED_LIBRARIES.filter(
    library => !libraries.some(file => basename(file).startsWith(library.replace('*', ''))),
  )
  if (missing.length > 0 || libraries.length !== SHARED_LIBRARIES.length) {
    throw new Error(
      `Expected one copy of each of ${SHARED_LIBRARIES.join(', ')}; found: ${libraries.join(', ') || 'none'}`,
    )
  }
  mkdirSync(join(outDir, 'lib'), { recursive: true })
  for (const library of libraries) {
    copyFileSync(join(REPO_ROOT, library), join(outDir, 'lib', basename(library)))
  }
}
