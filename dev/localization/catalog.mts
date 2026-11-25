import { join, resolve } from 'node:path'
import { CatalogRowNotFoundError, runLocalizationCli } from '@vouchington/localization-compiler'

const DEFAULT_SOURCE = 'localization/normalized-fixture'

export async function runCatalogCli(args: readonly string[]): Promise<void> {
  const input = args[0] === '--' ? args.slice(1) : args
  const command = input[0]
  const source = resolve(value(input, '--source') ?? DEFAULT_SOURCE)
  if (command === 'git-merge' || command === 'conflict-resolve') return runLocalizationCli(input)
  if (command === 'format') return runLocalizationCli(['format', '--source', source])
  if (command === 'csv-export') {
    return runLocalizationCli([
      'csv-export',
      '--source',
      source,
      '--output',
      required(input, '--output'),
    ])
  }
  if (command === 'csv-import') {
    return runLocalizationCli([
      'csv-import',
      '--input',
      required(input, '--input'),
      '--output',
      resolve(required(input, '--output')),
    ])
  }
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
    } catch (err) {
      if (err instanceof CatalogRowNotFoundError) return
      throw err
    }
  }
  throw new Error(usage())
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
  const argumentValue = index === -1 ? undefined : args[index + 1]
  return argumentValue === undefined || argumentValue.startsWith('--') ? undefined : argumentValue
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
