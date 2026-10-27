import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { compileLocalizationSqlite, loadCatalogDirectory } from '@vouchington/localization-compiler'

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
