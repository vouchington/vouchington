export const JSCPD_REPORT_FILE = 'jscpd-report.json'

export type CloneLocation = {
  name: string
  start: number
  end: number
}

export type JscpdClone = {
  kind: string
  lines: number
  isNew: boolean
  firstFile: CloneLocation
  secondFile: CloneLocation
}

export type JscpdReport = {
  clones: JscpdClone[]
  sources: number
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, expected: string): never {
  throw new Error(`Unexpected ${JSCPD_REPORT_FILE} shape: ${path} must be ${expected}`)
}

function readRecord(value: unknown, path: string): UnknownRecord {
  return isRecord(value) ? value : fail(path, 'an object')
}

function readInteger(record: UnknownRecord, key: string, path: string): number {
  const value = record[key]
  return Number.isInteger(value) ? (value as number) : fail(`${path}.${key}`, 'an integer')
}

function readString(record: UnknownRecord, key: string, path: string): string {
  const value = record[key]
  return typeof value === 'string' && value.length > 0
    ? value
    : fail(`${path}.${key}`, 'a non-empty string')
}

function readLocation(value: unknown, path: string): CloneLocation {
  const record = readRecord(value, path)
  return {
    name: readString(record, 'name', path),
    start: readInteger(record, 'start', path),
    end: readInteger(record, 'end', path),
  }
}

// Strict on purpose: if a jscpd upgrade drops or renames `isNew`, the gate must fail loudly rather
// than silently report zero new clones.
function readClone(value: unknown, index: number): JscpdClone {
  const path = `duplicates[${index}]`
  const record = readRecord(value, path)
  if (typeof record.isNew !== 'boolean') fail(`${path}.isNew`, 'a boolean')
  return {
    kind: readString(record, 'kind', path),
    lines: readInteger(record, 'lines', path),
    isNew: record.isNew,
    firstFile: readLocation(record.firstFile, `${path}.firstFile`),
    secondFile: readLocation(record.secondFile, `${path}.secondFile`),
  }
}

export function parseJscpdReport(text: string): JscpdReport {
  const report = readRecord(JSON.parse(text), 'report')
  if (!Array.isArray(report.duplicates)) fail('duplicates', 'an array')
  const statistics = readRecord(report.statistics, 'statistics')
  const total = readRecord(statistics.total, 'statistics.total')
  return {
    clones: report.duplicates.map(readClone),
    sources: readInteger(total, 'sources', 'statistics.total'),
  }
}

function formatLocation(location: CloneLocation): string {
  return `${location.name}:${location.start}-${location.end}`
}

export function formatClone(clone: JscpdClone): string {
  return `${clone.kind} ${formatLocation(clone.firstFile)} ~ ${formatLocation(clone.secondFile)} (${clone.lines} lines)`
}
