import { describe, expect, it } from 'vitest'
import { spendSecurityPageBudget } from './security-record-budget.mts'

/** Each source drains `pages[source]` pages; the last page reports hasMore=false. */
function pager(pages: Record<string, number>) {
  const visits: string[] = []
  const cleanupPage = async (source: string) => {
    visits.push(source)
    const left = (pages[source] ?? 0) - visits.filter(v => v === source).length
    return { deleted: 1, hasMore: left > 0 }
  }
  return { visits, cleanupPage }
}

describe('security page budget', () => {
  it('drains several pages of one source in a single run', async () => {
    const { visits, cleanupPage } = pager({ a: 3, b: 1 })
    const result = await spendSecurityPageBudget(['a', 'b'], 0, 10, cleanupPage)
    expect(visits.filter(v => v === 'a')).toHaveLength(3)
    expect(result).toEqual({ deleted: 4, hasMore: false })
  })

  it('stops at the budget across sources and reports more work', async () => {
    const { visits, cleanupPage } = pager({ a: 5, b: 5, c: 5 })
    const result = await spendSecurityPageBudget(['a', 'b', 'c'], 1, 4, cleanupPage)
    expect(visits).toEqual(['b', 'c', 'a', 'b'])
    expect(result).toEqual({ deleted: 4, hasMore: true })
  })

  it('stops visiting exhausted sources', async () => {
    const { visits, cleanupPage } = pager({ a: 1, b: 3, c: 1 })
    await spendSecurityPageBudget(['a', 'b', 'c'], 0, 10, cleanupPage)
    expect(visits).toEqual(['a', 'b', 'c', 'b', 'b'])
  })

  it('reports no more work when the budget exactly drains everything', async () => {
    const { cleanupPage } = pager({ a: 1, b: 1 })
    expect(await spendSecurityPageBudget(['a', 'b'], 1, 2, cleanupPage)).toEqual({
      deleted: 2,
      hasMore: false,
    })
  })
})
