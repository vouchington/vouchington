import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import {
  exportCatalogCsv,
  importCatalogCsv,
  loadCatalogDirectory,
  runLocalizationCli,
} from '@vouchington/localization-compiler'
import { serializeCatalogTable } from '@vouchington/localization'

const DEFAULT_SOURCE = 'localization/normalized-fixture'
const MANAGED_TABLES = ['copies.json', 'aliases.json', 'translations'] as const

export async function runCatalogCli(args: readonly string[]): Promise<void> {
  const input = args[0] === '--' ? args.slice(1) : args
  const command = input[0]
  const source = resolve(value(input, '--source') ?? DEFAULT_SOURCE)
  if (command === 'git-merge' || command === 'conflict-resolve') return runLocalizationCli(input)
  if (command === 'format') return runLocalizationCli(['format', '--source', source])
  if (command === 'csv-export') return csvExport(source, required(input, '--output'))
  if (command === 'csv-import')
    return csvImport(required(input, '--input'), resolve(required(input, '--output')))
  const file = tableFile(command, source, input)
  if (command.endsWith('-set')) {
    return runLocalizationCli([
      'upsert',
      '--file',
      file,
      '--row',
      JSON.stringify(row(command, input)),
    ])
  }
  if (command.endsWith('-remove')) {
    const id = required(input, '--id')
    const remove = ['remove', '--file', file, '--id', id]
    const consumer = command === 'alias-remove' ? required(input, '--consumer') : undefined
    if (consumer !== undefined) remove.push('--consumer', consumer)
    try {
      return await runLocalizationCli(remove)
    } catch (error) {
      if (error instanceof TypeError && error.message === `Catalog table does not contain "${id}"`)
        return
      throw error
    }
  }
  throw new Error(usage())
}

async function csvExport(source: string, output: string): Promise<void> {
  const { catalog } = await loadCatalogDirectory(source)
  mkdirSync(dirname(output), { recursive: true })
  // Route membership is generated from source closure, not edited through translation CSV.
  writeFileSync(
    output,
    exportCatalogCsv({
      copies: catalog.copies,
      aliases: catalog.aliases,
      translations: catalog.translations,
    }),
  )
}
async function csvImport(input: string, output: string): Promise<void> {
  const catalog = importCatalogCsv(readFileSync(input, 'utf8'))
  const copies = serializeCatalogTable(catalog.copies)
  const aliases = serializeCatalogTable(catalog.aliases)
  const locales = Object.entries(catalog.translations).map(
    ([locale, rows]) => [locale, serializeCatalogTable(rows)] as const,
  )
  mkdirSync(dirname(output), { recursive: true })
  const staging = mkdtempSync(join(dirname(output), `${basename(output)}.csv-import-`))
  let backup: string | undefined
  let committed = false
  let retainBackup = false
  let failed: unknown
  try {
    mkdirSync(join(staging, 'translations'))
    writeFileSync(join(staging, 'copies.json'), copies)
    writeFileSync(join(staging, 'aliases.json'), aliases)
    for (const [locale, body] of locales)
      writeFileSync(join(staging, 'translations', `${locale}.json`), body)
    await loadCatalogDirectory(staging)
    backup = mkdtempSync(join(dirname(output), `${basename(output)}.csv-import-backup-`))
    const parked: string[] = []
    const promoted: string[] = []
    try {
      for (const name of MANAGED_TABLES) {
        const source = join(output, name)
        if (existsSync(source)) {
          renameSync(source, join(backup, name))
          parked.push(name)
        }
      }
      mkdirSync(output, { recursive: true })
      for (const name of MANAGED_TABLES) {
        renameSync(join(staging, name), join(output, name))
        promoted.push(name)
      }
      committed = true
    } catch (error) {
      try {
        for (const name of promoted) rmSync(join(output, name), { recursive: true, force: true })
        for (const name of parked) renameSync(join(backup, name), join(output, name))
      } catch {
        retainBackup = true
      }
      throw error
    }
  } catch (error) {
    failed = error
  } finally {
    try {
      rmSync(staging, { recursive: true, force: true })
      if (backup !== undefined && !retainBackup) rmSync(backup, { recursive: true, force: true })
    } catch (error) {
      if (failed === undefined && !committed) failed = error
    }
  }
  if (failed !== undefined) throw failed
}
function tableFile(command: string | undefined, source: string, args: readonly string[]): string {
  if (command?.startsWith('alias-')) return join(source, 'aliases.json')
  if (command?.startsWith('copy-')) return join(source, 'copies.json')
  if (command?.startsWith('translation-'))
    return join(source, 'translations', `${required(args, '--locale')}.json`)
  throw new Error(usage())
}
function row(command: string, args: readonly string[]): Record<string, unknown> {
  if (command.startsWith('alias-'))
    return {
      consumer: required(args, '--consumer'),
      alias: required(args, '--alias'),
      copyId: required(args, '--copy-id'),
    }
  if (command.startsWith('copy-'))
    return {
      id: required(args, '--id'),
      descriptor: JSON.parse(value(args, '--descriptor') ?? 'null'),
    }
  return { id: required(args, '--id'), value: JSON.parse(required(args, '--value')) }
}
function value(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  const value = index === -1 ? undefined : args[index + 1]
  return value === undefined || value.startsWith('--') ? undefined : value
}
function required(args: readonly string[], flag: string): string {
  const result = value(args, flag)
  if (result === undefined) throw new Error(usage())
  return result
}
function usage(): string {
  return 'Usage: catalog <alias|copy|translation>-<set|remove> [flags] | format | csv-export | csv-import | git-merge <ancestor> <ours> <theirs> --path <catalog path> | conflict-resolve --file <file> --id <id-or-alias> --take ours|theirs'
}

if (import.meta.main) await runCatalogCli(process.argv.slice(2))
