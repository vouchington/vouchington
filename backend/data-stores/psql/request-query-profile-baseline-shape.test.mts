import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  findUnbaselinedRepeats,
  formatClosedBaselineIssues,
  parseRepeatBaseline,
  temporaryBaselineEntries,
} from '../../test-helpers/request-query-profile-baseline.mts'

const BASELINE_URL = new URL(
  '../../test-helpers/api/request-query-profile-baseline.json',
  import.meta.url,
)
const temporary = {
  annotation: 'a',
  routes: ['GET /a'],
  maxCount: null,
  reason: 'covered by the owning issue',
  issue: 1,
}
const permanent = {
  annotation: 'b',
  routes: ['GET /b'],
  maxCount: null,
  reason: 'rereads after a lock',
  permanent: true as const,
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
  it('validates the committed baseline and the locations its code pointers name', () => {
    const entries = parseRepeatBaseline(JSON.parse(readFileSync(BASELINE_URL, 'utf8')))
    const bad = entries.flatMap(entry => {
      if (!('code' in entry)) return []
      const split = entry.code.lastIndexOf(':')
      const target = entry.code.slice(split + 1)
      const url = new URL(`../../../${entry.code.slice(0, split)}`, import.meta.url)
      if (!existsSync(url)) return [entry.code]
      const source = readFileSync(url, 'utf8')
      const found = /^\d/.test(target)
        ? Number(target.split('-').at(-1)) <= source.split('\n').length
        : source.includes(target.split('.').at(-1)!)
      return found ? [] : [entry.code]
    })
    expect(bad).toEqual([])
  })

  it('keeps the committed RSS batch allowance to two calls on the trending route', () => {
    const entries = parseRepeatBaseline(JSON.parse(readFileSync(BASELINE_URL, 'utf8')))
    const two = [{ annotation: 'getRssFeedsByIdBatch', count: 2 }]
    const three = [{ annotation: 'getRssFeedsByIdBatch', count: 3 }]
    expect(findUnbaselinedRepeats('GET /api/v1/rss-feeds/trending', two, entries)).toEqual([])
    expect(findUnbaselinedRepeats('GET /api/v1/rss-feeds/recommended', two, entries)).toEqual(two)
    expect(findUnbaselinedRepeats('GET /api/v1/rss-feeds/trending', three, entries)).toEqual(three)
  })

  it('accepts a temporary and a permanent entry', () => {
    expect(parseRepeatBaseline([temporary, permanent])).toEqual([temporary, permanent])
    expect(temporaryBaselineEntries([temporary, permanent])).toEqual([temporary])
  })

  it('requires named scopes and validates route, worker, and count shapes', () => {
    const scoped = {
      ...permanent,
      annotation: 'getRssFeedsByIdBatch',
      routes: ['GET /api/v1/rss-feeds/trending'],
      maxCount: 2,
    }
    expect(parseRepeatBaseline([scoped, permanent])).toEqual([scoped, permanent])
    expect(
      parseRepeatBaseline([
        {
          ...scoped,
          annotation: 'worker-only',
          routes: [],
          workers: [{ queue: 'background', job: 'refresh' }],
          maxCount: null,
        },
      ]),
    ).toHaveLength(1)
    expect(
      parseRepeatBaseline([{ ...scoped, routes: ['POST /api/v1/mcp tools/call addListItem'] }]),
    ).toHaveLength(1)
    for (const bad of [
      { ...scoped, routes: [] },
      { ...scoped, routes: null },
      { ...scoped, routes: ['GET /api/v1/rss-feeds/trending?limit=1'] },
      { ...scoped, routes: ['*'] },
      { ...scoped, routes: [''] },
      { ...scoped, workers: [{ queue: '*', job: 'refresh' }] },
      { ...scoped, workers: [{ queue: 'background', job: '' }] },
      { ...scoped, workers: [{ queue: 'background', job: 'refresh', extra: true }] },
      { ...scoped, maxCount: 1 },
      { ...scoped, maxCount: 2.5 },
      { ...scoped, maxCount: Number.POSITIVE_INFINITY },
    ])
      expect(parseError([bad])).not.toBe('')
    expect(parseError([{ ...scoped, routes: undefined }])).not.toBe('')
    expect(parseError([{ ...scoped, maxCount: undefined }])).not.toBe('')
    expect(parseError([{ ...scoped, route: scoped.routes[0] }])).not.toBe('')
    expect(parseRepeatBaseline([{ ...scoped, routes: ['GET /api/v1/*'] }])).toHaveLength(1)
  })

  it('accepts the same annotation on disjoint scopes but rejects overlapping keys', () => {
    const first = { ...permanent, annotation: 'same', routes: ['GET /one'] }
    const second = { ...first, routes: ['GET /two'] }
    expect(parseRepeatBaseline([first, second])).toEqual([first, second])
    expect(parseError([first, first])).toContain('duplicate scope')
    expect(parseError([{ ...first, routes: ['GET /one', 'GET /one'] }])).toContain(
      'duplicate scope',
    )
    const worker = {
      ...first,
      routes: [],
      workers: [{ queue: 'background', job: 'refresh' }],
    }
    expect(parseRepeatBaseline([first, worker])).toEqual([first, worker])
    expect(parseError([worker, worker])).toContain('duplicate scope')
  })

  it('rejects permanent pointers outside the repository', () => {
    for (const code of [
      '/etc/hosts.conf:1',
      '../outside/file.mts:1',
      'a/../../file.mts:1',
      'a.mts:0',
      'a.mts:5-2',
    ]) {
      expect(parseError([{ ...permanent, code }])).toContain(
        'needs `code` as "<repo path>:<line or symbol>"',
      )
    }
  })

  it('rejects whitespace-only annotations and reasons', () => {
    expect(parseError([{ annotation: ' ', reason: 'r', issue: 1 }])).toContain('annotation')
    expect(parseError([{ annotation: 'a', reason: ' ', issue: 1 }])).toContain('reason')
  })

  it('rejects malformed and duplicate entries with a message naming each', () => {
    const base = { annotation: 'a', routes: ['GET /a'], maxCount: null, reason: 'r' }
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
      'entry 8 ("g") has a duplicate scope ["g","route","GET /a"]',
      'entry 9 (undefined) is not an object',
    ])
    expect(parseError({})).toContain('must be an array')
  })

  it('names each temporary entry whose issue is closed or missing', () => {
    const entries = parseRepeatBaseline([
      { annotation: 'open', routes: ['GET /open'], maxCount: null, reason: 'r', issue: 1 },
      { annotation: 'closed', routes: ['GET /closed'], maxCount: null, reason: 'r', issue: 2 },
      { annotation: 'gone', routes: ['GET /gone'], maxCount: null, reason: 'r', issue: 3 },
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
