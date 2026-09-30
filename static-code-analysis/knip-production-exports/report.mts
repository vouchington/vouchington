export type FindingType = 'exports' | 'types'

export interface Finding {
  file: string
  symbol: string
  type: FindingType
}

/** Knip's output is unusable: not JSON, an unexpected shape, or issue types this check ignores. */
export class KnipOutputError extends Error {}

export const FINDING_TYPES: readonly FindingType[] = ['exports', 'types']

const METADATA_KEYS = new Set(['file', 'owners'])
const MAX_UNSUPPORTED_LISTED = 10

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export const findingKey = ({ file, symbol, type }: Finding) => `${file}\0${type}\0${symbol}`

/** Code-point order, so the baseline does not depend on the locale. */
export const compareFindings = (a: Finding, b: Finding) =>
  compare(a.file, b.file) || compare(a.type, b.type) || compare(a.symbol, b.symbol)

function parseJson(stdout: string): unknown {
  if (stdout.trim() === '') throw new KnipOutputError('knip printed nothing on stdout.')
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new KnipOutputError(`knip stdout is not valid JSON: ${String(error)}`, { cause: error })
  }
}

function readIssues(report: unknown): Record<string, unknown>[] {
  if (!isRecord(report) || !Array.isArray(report.issues) || Object.keys(report).length !== 1) {
    throw new KnipOutputError('knip JSON is not exactly `{"issues": [...]}`.')
  }
  const issues = report.issues.filter(isRecord)
  if (issues.length !== report.issues.length || issues.some(i => typeof i.file !== 'string')) {
    throw new KnipOutputError('knip JSON has an issue row without a string `file`.')
  }
  return issues
}

/** Turns knip's JSON report into sorted, de-duplicated, line-free `{file, type, symbol}` rows. */
export function parseKnipReport(stdout: string): Finding[] {
  const found = new Map<string, Finding>()
  const unsupported: string[] = []
  for (const issue of readIssues(parseJson(stdout))) {
    const file = issue.file as string
    for (const [key, value] of Object.entries(issue)) {
      if (METADATA_KEYS.has(key)) continue
      const type = FINDING_TYPES.find(candidate => candidate === key)
      const items = Array.isArray(value) ? value : undefined
      if (type && items?.every(item => isRecord(item) && typeof item.name === 'string')) {
        for (const item of items as { name: string }[]) {
          const finding = { file, symbol: item.name, type }
          found.set(findingKey(finding), finding)
        }
      } else if (items?.length !== 0) {
        unsupported.push(`${key} in ${file}`)
      }
    }
  }
  if (unsupported.length > 0) {
    const shown = unsupported.slice(0, MAX_UNSUPPORTED_LISTED).join(', ')
    const more = unsupported.length - MAX_UNSUPPORTED_LISTED
    throw new KnipOutputError(
      `knip reported issue types or fields this check does not track (only ${FINDING_TYPES.join(' and ')} are): ` +
        `${shown}${more > 0 ? `, and ${more} more` : ''}.`,
    )
  }
  return [...found.values()].toSorted(compareFindings)
}
