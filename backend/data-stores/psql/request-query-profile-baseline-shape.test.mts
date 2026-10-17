import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  formatClosedBaselineIssues,
  parseRepeatBaseline,
  temporaryBaselineEntries,
} from './request-query-profile-baseline.mts'

const BASELINE_URL = new URL(
  '../../test-helpers/api/request-query-profile-baseline.json',
  import.meta.url,
)
const temporary = { annotation: 'a', reason: 'covered by the owning issue', issue: 1 }
const permanent = {
  annotation: 'b',
  reason: 'rereads after a lock',
  permanent: true,
  code: 'backend/services/x.mts:12',
}

function parseError(raw: unknown): string {
  try {
    parseRepeatBaseline(raw)
  } catch (err) {
    return (err as Error).message
  }
  return ''
}

describe('request query profile baseline shapes', () => {
  it('validates the committed baseline and the files its code pointers name', () => {
    const entries = parseRepeatBaseline(JSON.parse(readFileSync(BASELINE_URL, 'utf8')))
    const missing = entries.flatMap(entry =>
      'code' in entry &&
      !existsSync(
        new URL(`../../../${entry.code.slice(0, entry.code.lastIndexOf(':'))}`, import.meta.url),
      )
        ? [entry.code]
        : [],
    )
    expect(missing).toEqual([])
  })

  it('accepts a temporary and a permanent entry', () => {
    expect(parseRepeatBaseline([temporary, permanent])).toEqual([temporary, permanent])
    expect(temporaryBaselineEntries([temporary, permanent])).toEqual([temporary])
  })

  it('rejects malformed and duplicate entries with a message naming each', () => {
    const base = { annotation: 'a', reason: 'r' }
    const shape =
      'must be temporary { annotation, reason, issue } or permanent { annotation, reason, permanent: true, code }'
    const message = parseError([
      { ...base, issue: 0 },
      { ...base, annotation: 'b' },
      { ...base, annotation: 'c', issue: 1, permanent: true, code: 'x.mts:1' },
      { ...base, annotation: 'd', permanent: true, code: 'no pointer' },
      { ...base, annotation: 'e', permanent: false, code: 'x.mts:1' },
      { ...base, annotation: 'f', reason: '', issue: 1 },
      { ...base, annotation: '', issue: 1 },
      { ...base, annotation: 'g', issue: 1 },
      { ...base, annotation: 'g', issue: 2 },
      null,
    ])
    expect(message.split('\n')).toEqual([
      'Malformed query-profile baseline:',
      'entry 0 ("a") needs `issue` to be a positive issue number',
      `entry 1 ("b") ${shape}`,
      `entry 2 ("c") ${shape}`,
      'entry 3 ("d") needs `code` as "<repo path>:<line or symbol>"',
      'entry 4 ("e") needs `permanent: true`',
      'entry 5 ("f") needs a non-empty reason',
      'entry 6 ("") needs a non-empty annotation',
      'entry 8 ("g") is a duplicate',
      'entry 9 (undefined) is not an object',
    ])
    expect(parseError({})).toContain('must be an array')
  })

  it('names each temporary entry whose issue is closed or missing', () => {
    const entries = parseRepeatBaseline([
      { annotation: 'open', reason: 'r', issue: 1 },
      { annotation: 'closed', reason: 'r', issue: 2 },
      { annotation: 'gone', reason: 'r', issue: 3 },
      permanent,
    ])
    const states = new Map([
      [1, 'open'],
      [2, 'closed'],
    ])
    expect(formatClosedBaselineIssues(entries, states)).toEqual([
      expect.stringContaining('Baseline entry closed points at #2, which is closed.'),
      expect.stringContaining('Baseline entry gone points at #3, which is not found.'),
    ])
  })
})
