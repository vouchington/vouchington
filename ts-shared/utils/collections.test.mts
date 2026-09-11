import { describe, expect, it } from 'vitest'
import {
  dedupeBy,
  dedupeById,
  dedupeByLast,
  mergePageResultsById,
  mergeRecords,
} from './collections.mts'

describe('dedupeBy', () => {
  it('removes duplicates based on the derived key, preserving first-seen order', () => {
    const items = [
      { slug: 'a', name: 'first' },
      { slug: 'b', name: 'second' },
      { slug: 'a', name: 'third' },
    ]
    expect(dedupeBy(items, x => x.slug)).toEqual([
      { slug: 'a', name: 'first' },
      { slug: 'b', name: 'second' },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(dedupeBy<number, number>([], x => x)).toEqual([])
  })

  it('supports primitive arrays via identity key', () => {
    expect(dedupeBy([1, 2, 1, 3, 2], x => x)).toEqual([1, 2, 3])
  })
})

describe('dedupeById', () => {
  it('removes duplicates preserving first-seen order', () => {
    const items = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
      { id: '1', name: 'c' },
    ]
    expect(dedupeById(items)).toEqual([
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(dedupeById([])).toEqual([])
  })

  it('returns all items when no duplicates', () => {
    const items = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ]
    expect(dedupeById(items)).toEqual(items)
  })
})

describe('dedupeByLast', () => {
  it('keeps the last item for each key', () => {
    const items = [
      { slug: 'a', name: 'first' },
      { slug: 'b', name: 'second' },
      { slug: 'a', name: 'third' },
    ]
    expect(dedupeByLast(items, x => x.slug)).toEqual([
      { slug: 'a', name: 'third' },
      { slug: 'b', name: 'second' },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(dedupeByLast<number, number>([], x => x)).toEqual([])
  })
})

describe('mergePageResultsById', () => {
  it('flattens page results and deduplicates by id with earlier pages taking priority', () => {
    const pages = [
      {
        results: [
          { id: '1', name: 'first' },
          { id: '2', name: 'second' },
        ],
      },
      {
        results: [
          { id: '2', name: 'later duplicate' },
          { id: '3', name: 'third' },
        ],
      },
    ]

    expect(mergePageResultsById(pages)).toEqual([
      { id: '1', name: 'first' },
      { id: '2', name: 'second' },
      { id: '3', name: 'third' },
    ])
  })

  it('returns an empty array for empty pages', () => {
    expect(mergePageResultsById([])).toEqual([])
    expect(mergePageResultsById(null)).toEqual([])
    expect(mergePageResultsById(undefined)).toEqual([])
  })

  it('skips pages with nullish or missing results', () => {
    const pages: ReadonlyArray<
      { results?: ReadonlyArray<{ id: string; name: string }> | null } | null | undefined
    > = [
      { results: [{ id: '1', name: 'first' }] },
      null,
      undefined,
      { results: null },
      { results: undefined },
      {},
    ]

    expect(mergePageResultsById(pages)).toEqual([{ id: '1', name: 'first' }])
  })
})

describe('mergeRecords', () => {
  it('merges records from pages with earlier pages taking priority', () => {
    type Page = { data: Record<string, number> }
    const pages: Page[] = [{ data: { a: 1, b: 2 } }, { data: { b: 99, c: 3 } }]
    const result = mergeRecords(pages, p => p.data)
    expect(result).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('returns empty record for empty pages', () => {
    expect(mergeRecords([], () => ({}))).toEqual({})
  })

  it('evaluates the record getter in page order', () => {
    const pages = [{ id: 'first' }, { id: 'second' }]
    const calls: string[] = []

    mergeRecords(pages, page => {
      calls.push(page.id)
      return { [page.id]: page.id }
    })

    expect(calls).toEqual(['first', 'second'])
  })
})
