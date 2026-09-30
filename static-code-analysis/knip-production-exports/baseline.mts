import {
  compareFindings,
  FINDING_TYPES,
  findingKey,
  isRecord,
  type Finding,
  type FindingType,
} from './report.mts'

/** The baseline file is not usable: not JSON, or not `{file: {exports?: [...], types?: [...]}}`. */
export class BaselineError extends Error {}

type BaselineFile = Record<string, Partial<Record<FindingType, string[]>>>

export interface BaselineDiff {
  /** Reported by knip now but absent from the baseline. */
  added: Finding[]
  /** In the baseline but no longer reported. */
  removed: Finding[]
}

/** Sorted, grouped by file, no line numbers: the same findings always serialize identically. */
export function serializeBaseline(findings: readonly Finding[]): string {
  const grouped: BaselineFile = {}
  for (const finding of findings.toSorted(compareFindings)) {
    const entry = grouped[finding.file] ?? {}
    grouped[finding.file] = entry
    const symbols = entry[finding.type] ?? []
    entry[finding.type] = symbols
    if (symbols.at(-1) !== finding.symbol) symbols.push(finding.symbol)
  }
  return `${JSON.stringify(grouped, null, 2)}\n`
}

const isFindingType = (value: string): value is FindingType =>
  FINDING_TYPES.some(type => type === value)

export function parseBaseline(text: string): Finding[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new BaselineError(`The baseline is not valid JSON: ${String(error)}`, { cause: error })
  }
  if (!isRecord(data)) throw new BaselineError('The baseline must be a JSON object keyed by file.')
  const findings: Finding[] = []
  for (const [file, entry] of Object.entries(data)) {
    if (!isRecord(entry))
      throw new BaselineError(`The baseline entry for ${file} must be an object.`)
    for (const [type, symbols] of Object.entries(entry)) {
      if (!isFindingType(type) || !Array.isArray(symbols)) {
        throw new BaselineError(
          `The baseline entry ${file}.${type} must be an exports or types array.`,
        )
      }
      for (const symbol of symbols) {
        if (typeof symbol !== 'string') {
          throw new BaselineError(`The baseline entry ${file}.${type} must only list symbol names.`)
        }
        findings.push({ file, symbol, type })
      }
    }
  }
  return findings.toSorted(compareFindings)
}

export function diffFindings(
  current: readonly Finding[],
  baseline: readonly Finding[],
): BaselineDiff {
  const currentKeys = new Set(current.map(findingKey))
  const baselineKeys = new Set(baseline.map(findingKey))
  return {
    added: current.filter(finding => !baselineKeys.has(findingKey(finding))),
    removed: baseline.filter(finding => !currentKeys.has(findingKey(finding))),
  }
}
