import { describe, expect, it } from 'vitest'
import { resolveInspectedPage } from './inspection-continuation.mts'

type Candidate = { at: number; id: string; eligible: boolean }
type Key = { at: number; id: string }
type Row = { row_kind: string; result_id: string; cursor_sort_at: string }

const stamp = (at: number) => `2026-01-01T00:00:${String(at).padStart(2, '0')}.000000Z`
const compare = (a: Key, b: Key) => (a.at - b.at !== 0 ? a.at - b.at : a.id < b.id ? -1 : 1)
const row = (kind: string, c: Key): Row => ({
  row_kind: kind,
  result_id: c.id,
  cursor_sort_at: stamp(c.at),
})

const keyOf = (r: Record<string, unknown>): Key => ({
  at: Number((r.cursor_sort_at as string).slice(17, 19)),
  id: r.result_id as string,
})

/** Mirrors the page statement: per-arm capped walk, per-arm LIMIT, stop key of a capped short arm. */
function statement(arms: Candidate[][], after: Key | null, cap: number, limit: number): Row[] {
  const out: Row[] = []
  for (const walk of arms) {
    const inspected = walk.filter(c => !after || compare(c, after) < 0).slice(0, cap)
    const eligible = inspected.filter(c => c.eligible).slice(0, limit + 1)
    for (const c of eligible) out.push(row('row', c))
    if (inspected.length === cap && eligible.length <= limit)
      out.push(row('stop', inspected[cap - 1]))
  }
  const rows = out.filter(r => r.row_kind === 'row').toSorted((a, b) => compare(keyOf(b), keyOf(a)))
  return [...rows.slice(0, limit + 1), ...out.filter(r => r.row_kind !== 'row')]
}

function pageAll(arms: Candidate[][], cap: number, limit: number): string[] {
  const ids: string[] = []
  let after: Key | null = null
  for (let step = 0; step < 500; step++) {
    const page = resolveInspectedPage(statement(arms, after, cap, limit), limit)
    for (const r of page.pageRows) ids.push(r.result_id as string)
    if (!page.hasNextPage) return ids
    const stop = page.inspectedStop
    const last = stop
      ? keyOf({ cursor_sort_at: stop.cursor_sort_at, result_id: stop.cursor_id })
      : keyOf(page.pageRows.at(-1)!)
    after = last
  }
  throw new Error('did not terminate')
}

function uncapped(arms: Candidate[][]): string[] {
  return arms
    .flat()
    .filter(c => c.eligible)
    .toSorted((a, b) => compare(b, a))
    .map(c => c.id)
}

function arm(prefix: string, spec: Array<[number, boolean]>): Candidate[] {
  return spec
    .map(([at, eligible], i) => ({ at, id: `${prefix}${String(i).padStart(2, '0')}`, eligible }))
    .toSorted((a, b) => compare(b, a))
}

describe('paging a capped feed to the end', () => {
  it('matches the uncapped merge across an empty page, a finished arm and equal timestamps', () => {
    const direct = arm('d', [
      [50, false],
      [49, false],
      [48, false],
      [47, true],
      [30, true],
      [30, false],
      [10, true],
    ])
    const share = arm('s', [
      [47, true],
      [30, true],
      [20, false],
      [5, true],
    ])
    for (const cap of [1, 2, 3, 4]) {
      for (const limit of [1, 2, 3]) {
        expect(pageAll([direct, share], cap, limit)).toEqual(uncapped([direct, share]))
      }
    }
  })

  it('matches the uncapped merge over generated arms', () => {
    let seed = 7
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    for (let round = 0; round < 200; round++) {
      const make = (prefix: string) =>
        arm(
          prefix,
          Array.from({ length: next(12) }, () => [next(8), next(3) === 0]),
        )
      const arms = [make('d'), make('s')]
      const cap = 1 + next(4)
      const limit = 1 + next(3)
      expect(pageAll(arms, cap, limit)).toEqual(uncapped(arms))
    }
  })
})
