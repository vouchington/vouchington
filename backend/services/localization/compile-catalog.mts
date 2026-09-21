import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { compileLocalizationSqlite, loadCatalogDirectory } from '@vouchington/localization-compiler'
import { localizationSqlitePath } from './database.mts'

export function catalogScratchDirectory(): string {
  if (existsSync('/dev/shm')) return '/dev/shm'
  return process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir()
}

export async function compileCatalogDirectory(source: string, output: string): Promise<string> {
  const loaded = await loadCatalogDirectory(resolve(source))
  mkdirSync(dirname(output), { recursive: true })
  const resolvedOutput = resolve(output)
  const previousTmpdir = process.env.TMPDIR
  process.env.TMPDIR = dirname(resolvedOutput)
  try {
    console.log(`localization: compiling catalog to ${resolvedOutput}`)
    return compileLocalizationSqlite(loaded.catalog, resolvedOutput)
  } finally {
    restoreTmpdir(previousTmpdir)
  }
}

/** Compile catalog JSON into a temp SQLite file and point `LOCALIZATION_SQLITE_PATH` at it. */
export async function compileCatalogForProcess(options?: {
  source?: string
  output?: string
}): Promise<string> {
  const output =
    options?.output ?? join(catalogScratchDirectory(), `vouchington-catalog-${process.pid}.sqlite`)
  await compileCatalogDirectory(options?.source ?? 'localization/catalog', output)
  process.env.LOCALIZATION_SQLITE_PATH = output
  return output
}

export async function ensurePlaywrightLocalizationSqlite(options?: {
  source?: string
  output?: string
}): Promise<void> {
  if (process.env.PLAYWRIGHT_TEST !== 'true') return
  if (existsSync(options?.output ?? localizationSqlitePath())) return
  await compileCatalogForProcess(options)
}

export async function runCompileCli(args: readonly string[]): Promise<string> {
  return compileCatalogDirectory(
    optionalArg(args, '--source') ?? 'localization/catalog',
    optionalArg(args, '--output') ?? '/app/localization/catalog.sqlite',
  )
}

function restoreTmpdir(previous: string | undefined): void {
  if (previous === undefined) Reflect.deleteProperty(process.env, 'TMPDIR')
  else process.env.TMPDIR = previous
}

function optionalArg(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (value === undefined || value.length === 0) throw new Error(`Missing value for ${flag}`)
  return value
}
