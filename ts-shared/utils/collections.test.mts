import { describe, expect, it } from 'vitest'
import { mergeRecords } from './collections.mts'

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
