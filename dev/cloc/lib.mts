import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { parse } from 'csv-parse/sync'

import {
  categoryNames,
  classifyFile,
  normalizePath,
  serviceNames,
  type ServiceName,
} from './classify.mts'
import { countTargetsFor, excludedDirs, isCountedPath } from './paths.mts'
import { requireSuccess, terminateChild } from './child-process.mts'

export { classifyFile } from './classify.mts'

const rowOrder = [...serviceNames, 'total'] as const

export type ClocRow = {
  service: ServiceName | 'total'
  source: number
  tests: number
  tooling: number
  total: number
}

type CountedFile = {
  code: number
  path: string
}

export function isSccRecordLine(row: string): boolean {
  return !row.includes('\n') && !/\r./u.test(row)
}

export function buildRows(files: CountedFile[]): ClocRow[] {
  const rows = new Map<ServiceName | 'total', ClocRow>()

  function rowFor(service: ServiceName | 'total'): ClocRow {
    const existing = rows.get(service)
    if (existing) return existing
    const row: ClocRow = { service, source: 0, tests: 0, tooling: 0, total: 0 }
    rows.set(service, row)
    return row
  }

  for (const service of serviceNames) rowFor(service)
  rowFor('total')

  for (const file of files) {
    const { category, service } = classifyFile(file.path)
    const row = rowFor(service)
    row[category] += file.code
    row.total += file.code

    const total = rowFor('total')
    total[category] += file.code
    total.total += file.code
  }

  return rowOrder.map(service => rowFor(service))
}

export function formatRows(rows: ClocRow[]): string {
  const columns = ['service', ...categoryNames, 'total'] as const
  const widths = Object.fromEntries(
    columns.map(column => [
      column,
      Math.max(column.length, ...rows.map(row => String(row[column]).length)),
    ]),
  ) as Record<(typeof columns)[number], number>

  function formatCell(column: (typeof columns)[number], value: string | number): string {
    const text = String(value)
    return column === 'service' ? text.padEnd(widths[column]) : text.padStart(widths[column])
  }

  const header = columns.map(column => formatCell(column, column)).join('  ')
  const separator = columns.map(column => '-'.repeat(widths[column])).join('  ')
  const body = rows.map(row => columns.map(column => formatCell(column, row[column])).join('  '))
  return [header, separator, ...body].join('\n')
}

async function listTrackedFiles(): Promise<Set<string>> {
  const child = spawn('git', ['ls-files', '-z'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const completion = requireSuccess(child, 'git ls-files')
  const files = new Set<string>()
  let remainder = Buffer.alloc(0)
  let completed = false
  try {
    for await (const chunk of child.stdout) {
      const data = remainder.byteLength === 0 ? chunk : Buffer.concat([remainder, chunk])
      let start = 0
      for (;;) {
        const end = data.indexOf(0, start)
        if (end === -1) break
        if (end > start) files.add(normalizePath(data.subarray(start, end).toString('utf8')))
        start = end + 1
      }
      remainder = data.subarray(start)
    }
    await completion
    completed = true
  } finally {
    if (!completed) await terminateChild(child, completion)
  }
  if (remainder.byteLength > 0) files.add(normalizePath(remainder.toString('utf8')))
  return files
}

export function shouldCountFile(filePath: string, trackedFiles: Set<string>): boolean {
  return (
    trackedFiles.has(filePath) &&
    isCountedPath(filePath) &&
    !filePath.includes('/fixtures/') &&
    !filePath.includes('/__fixtures__/') &&
    !filePath.includes('/__snapshots__/') &&
    !filePath.startsWith('fixtures/') &&
    !filePath.startsWith('__fixtures__/') &&
    !filePath.startsWith('__snapshots__/')
  )
}

async function readSccFiles(
  sccBin: string,
  countTargets: readonly string[],
  trackedFiles: Set<string>,
): Promise<CountedFile[]> {
  const child = spawn(
    sccBin,
    [
      '--format',
      'csv-stream',
      '--by-file',
      '--no-cocomo',
      '--no-complexity',
      '--exclude-dir',
      excludedDirs.join(','),
      ...countTargets,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const completion = requireSuccess(child, 'scc')
  const files: CountedFile[] = []
  const rows = createInterface({ input: child.stdout, crlfDelay: Infinity })
  let header = true
  let completed = false
  try {
    for await (const row of rows) {
      if (header) {
        header = false
        continue
      }
      if (!isSccRecordLine(row)) throw new Error('Invalid CSV record from scc')
      const records = parse(row) as string[][]
      const fields = records.length === 1 ? records[0] : undefined
      const path = fields?.[1]
      const code = Number(fields?.[4])
      if (!path || !fields?.[4]?.trim() || !Number.isSafeInteger(code))
        throw new Error('Invalid CSV record from scc')
      const file = { code, path: normalizePath(path) }
      if (shouldCountFile(file.path, trackedFiles)) files.push(file)
    }
    await completion
    completed = true
  } finally {
    rows.close()
    if (!completed) await terminateChild(child, completion)
  }
  return files
}

export async function countFiles(): Promise<CountedFile[]> {
  const trackedFiles = await listTrackedFiles()
  const countTargets = countTargetsFor(trackedFiles)
  const sccBin = process.env.SCC_BIN ?? 'scc'
  try {
    return await readSccFiles(sccBin, countTargets, trackedFiles)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'scc is required for pnpm run cloc. Run mise install; if mise is unavailable, provision the host from https://github.com/vouchington/vouchington-machines. See docs/development/system-dependencies.md.',
        { cause: err },
      )
    }
    throw err
  }
}
