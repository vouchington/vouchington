#!/usr/bin/env bun
// Compiles the backend entrypoints into standalone Bun executables for the backend images.
// Runs under Bun (`bun static-code-analysis/docker-deploy/compile-backend-binaries.mts <out>`);
// development and tests keep running the TypeScript sources under Node.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { copySharedLibraries, stageRuntimeFiles } from './compile-runtime-files.mts'
import {
  EMBEDDED_ROOT_NAME,
  REPO_ROOT,
  sourceRewritePlugin,
  type BunPlugin,
} from './compile-source-rewrites.mts'

const BACKEND = join(REPO_ROOT, 'backend')

// CPU-only native code (sharp, vurst-ai) stays out of the lightweight api and worker-io closures.
const CPU_ONLY_MODULES =
  /\/node_modules\/(?:sharp|@img\/sharp-[^/]+|@jongleberry\/vurst-ai(?:-[^/]+)?)\//

const BACKEND_BINARIES = [
  { name: 'api', entry: 'backend/entrypoints/api/executable.mts', excludes: CPU_ONLY_MODULES },
  {
    name: 'worker-io',
    entry: 'backend/entrypoints/worker-io/executable.mts',
    excludes: CPU_ONLY_MODULES,
  },
  { name: 'worker-cpu', entry: 'backend/entrypoints/worker-cpu/executable.mts', excludes: null },
] as const

// `@duckdb/node-bindings` requires every platform package unconditionally; only the build
// platform's package is installed. playwright-core lazily requires its optional BiDi bundle.
const OPTIONAL_UNRESOLVED_IMPORTS = ['chromium-bidi', 'chromium-bidi/*']
const DUCKDB_PLATFORM_PACKAGES = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
]

type BunBuildResult = { success: boolean; logs: unknown[]; outputs: { path: string }[] }
type BunBuild = (config: {
  entrypoints: string[]
  target?: 'bun'
  outdir?: string
  naming?: string
  external?: string[]
  define?: Record<string, string>
  plugins?: BunPlugin[]
  sourcemap?: 'linked' | 'none'
  compile?: {
    outfile: string
    assets?: string[]
    autoloadDotenv?: boolean
    autoloadBunfig?: boolean
  }
}) => Promise<BunBuildResult>

function bunBuild(config: Parameters<BunBuild>[0]): Promise<BunBuildResult> {
  return (globalThis as unknown as { Bun: { build: BunBuild } }).Bun.build(config)
}

function externals(): string[] {
  const platform = `${process.platform}-${process.arch}`
  return [
    ...OPTIONAL_UNRESOLVED_IMPORTS,
    ...DUCKDB_PLATFORM_PACKAGES.filter(name => name !== platform).map(
      name => `@duckdb/node-bindings-${name}`,
    ),
  ]
}

async function build(config: Parameters<BunBuild>[0]): Promise<BunBuildResult> {
  const result = await bunBuild({
    target: 'bun',
    // Bun.build inlines `process.env.NODE_ENV` ("development" unless set); keep it a run-time
    // read so the deployed environment, not the build, decides.
    define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
    external: externals(),
    plugins: [sourceRewritePlugin],
    ...config,
  })
  for (const log of result.logs) console.error(log)
  if (!result.success) throw new Error(`bun build failed for ${config.entrypoints.join(', ')}`)
  return result
}

function assertClosureExcludes(outfile: string, excludes: RegExp | null): void {
  if (!excludes) return
  const { sources } = JSON.parse(readFileSync(`${outfile}.map`, 'utf8')) as { sources: string[] }
  const included = sources.filter(source => excludes.test(source))
  if (included.length > 0) {
    throw new Error(
      `${basename(outfile)} bundles CPU-only modules: ${included.slice(0, 5).join(', ')}`,
    )
  }
}

// Bun's bundler runs a wrapped module's ESM dependencies before its CommonJS side-effect
// imports, so @simplewebauthn/server's `import 'reflect-metadata'` would run after the tsyringe
// check in @peculiar/x509. The polyfill is loaded before the application graph instead.
function writeEntryWrapper(dir: string, name: string, entry: string): string {
  const passkeys = createRequire(join(BACKEND, 'services/passkeys/package.json'))
  const simpleWebAuthn = createRequire(passkeys.resolve('@simplewebauthn/server'))
  const wrapper = join(dir, `${name}.mts`)
  writeFileSync(
    wrapper,
    `import ${JSON.stringify(simpleWebAuthn.resolve('reflect-metadata'))}\n` +
      `await import(${JSON.stringify(join(REPO_ROOT, entry))})\n`,
  )
  return wrapper
}

async function compileBackendBinaries(outDir: string): Promise<void> {
  const workDir = mkdtempSync(join(tmpdir(), 'voucha-compile-'))
  try {
    const stagingRoot = join(workDir, EMBEDDED_ROOT_NAME)
    await stageRuntimeFiles(stagingRoot, async (entry, outdir) => {
      const [output] = (await build({ entrypoints: [entry], outdir })).outputs
      if (!output) throw new Error(`bun build produced no output for ${entry}`)
      return output.path
    })
    mkdirSync(outDir, { recursive: true })
    copySharedLibraries(outDir)
    for (const binary of BACKEND_BINARIES) {
      const outfile = join(outDir, binary.name)
      await build({
        entrypoints: [writeEntryWrapper(workDir, binary.name, binary.entry)],
        sourcemap: 'linked',
        // Like Node, take configuration only from the process environment.
        compile: {
          outfile,
          assets: [stagingRoot],
          autoloadDotenv: false,
          autoloadBunfig: false,
        },
      })
      assertClosureExcludes(outfile, binary.excludes)
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const [outDir] = process.argv.slice(2)
  if (!outDir) throw new Error('usage: compile-backend-binaries.mts <out-dir>')
  await compileBackendBinaries(resolve(outDir))
}
