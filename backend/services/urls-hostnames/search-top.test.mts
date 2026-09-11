import { describe, it, expect, beforeAll } from 'vitest'
import { insertTestUrlHostname, setUrlHostnameVotes } from '@voucha/test-helpers'
import { searchTopHostnames } from './search-top.mts'

describe('searchTopHostnames', () => {
  let highTrustHostnameId: string
  let medTrustHostnameId: string
  let lowTrustHostnameId: string
  let blockedHostnameId: string
  const random = Math.random().toString(36).slice(2, 10)

  beforeAll(async () => {
    highTrustHostnameId = await insertTestUrlHostname({
      hostname: `top-high-${random}.example.com`,
    })
    await setUrlHostnameVotes(highTrustHostnameId, 500, 10)

    medTrustHostnameId = await insertTestUrlHostname({
      hostname: `top-med-${random}.example.com`,
    })
    await setUrlHostnameVotes(medTrustHostnameId, 300, 10)

    lowTrustHostnameId = await insertTestUrlHostname({
      hostname: `top-low-${random}.example.com`,
    })
    await setUrlHostnameVotes(lowTrustHostnameId, 100, 10)

    blockedHostnameId = await insertTestUrlHostname({
      hostname: `top-blocked-${random}.example.com`,
      blocked: true,
    })
    await setUrlHostnameVotes(blockedHostnameId, 1000, 5)
  })

  it('returns hostnames ordered by votes_score_net DESC', async () => {
    const { results } = await searchTopHostnames({ limit: 100 })
    const ids = results.map(r => r.id)
    const highIdx = ids.indexOf(highTrustHostnameId)
    const medIdx = ids.indexOf(medTrustHostnameId)
    const lowIdx = ids.indexOf(lowTrustHostnameId)

    expect(highIdx).toBeGreaterThanOrEqual(0)
    expect(medIdx).toBeGreaterThanOrEqual(0)
    expect(lowIdx).toBeGreaterThanOrEqual(0)
    expect(highIdx).toBeLessThan(medIdx)
    expect(medIdx).toBeLessThan(lowIdx)
  })

  it('excludes blocked hostnames', async () => {
    const { results } = await searchTopHostnames({ limit: 100 })
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(blockedHostnameId)
  })

  it('excludes hostnames with zero upvotes', async () => {
    const noVoteId = await insertTestUrlHostname({
      hostname: `top-novotes-${random}.example.com`,
    })
    const { results } = await searchTopHostnames({ limit: 100 })
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(noVoteId)
  })

  it('supports pagination with after cursor', async () => {
    const first = await searchTopHostnames({ limit: 1 })
    expect(first.results).toHaveLength(1)
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).not.toBeNull()

    const second = await searchTopHostnames({ limit: 1, after: first.page_info.end_cursor! })
    expect(second.results).toHaveLength(1)
    expect(second.results[0].id).not.toBe(first.results[0].id)
    // Second page should have lower or equal score
    expect(second.results[0].votes_score_net).toBeLessThanOrEqual(first.results[0].votes_score_net)
  })

  it('returns correct page_info structure', async () => {
    // The DB accumulates hostnames across test runs, so we can't assume fewer than 100 results.
    // Just verify the page_info structure is valid.
    const { results, page_info } = await searchTopHostnames({ limit: 100 })
    expect(results.length).toBeGreaterThan(0)
    expect(typeof page_info.has_next_page).toBe('boolean')
    // When there is a next page, end_cursor must be set; otherwise it must be null.
    // Encode the constraint as a single boolean assertion to avoid conditional expect.
    const cursorConsistentWithPagination = page_info.has_next_page
      ? page_info.end_cursor !== null
      : page_info.end_cursor === null
    expect(cursorConsistentWithPagination).toBe(true)
  })

  it('returns vote columns in results', async () => {
    const { results } = await searchTopHostnames({ limit: 100 })
    const found = results.find(r => r.id === highTrustHostnameId)
    expect(found).toBeDefined()
    expect(found?.votes_score_net).toBe(490)
    expect(found?.votes_count_up).toBe(500)
    expect(found?.votes_count_down).toBe(10)
  })

  it('returns 400 for invalid cursor', async () => {
    await expect(searchTopHostnames({ after: 'invalidcursor!!' })).rejects.toThrow(Error)
  })
})
