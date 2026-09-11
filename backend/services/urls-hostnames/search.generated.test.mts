import { it, expect, describe } from 'vitest'
import { searchUrlHostnames } from './search.mts'
import { upsertUrlHostnames } from './upsert.mts'
import {
  createTestTopic,
  createTestUser,
  insertTestTopicParentRelation,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'

describe('search.generated', () => {
  const suffix = Math.random().toString(36).slice(2, 10)

  it('searchUrlHostnames returns hostnames matching query', async () => {
    const h1 = `search-${suffix}-1.com`
    const h2 = `search-${suffix}-2.com`
    await upsertUrlHostnames(null, [h1, h2, `search-other-${suffix}.com`])

    const { results } = await searchUrlHostnames({ query: `search-${suffix}` })
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results.some(h => h.hostname === h1)).toBe(true)
    expect(results.some(h => h.hostname === h2)).toBe(true)
  })

  it('searchUrlHostnames filters by blocked status', async () => {
    const blockedHost = `search-blocked-${suffix}.com`
    const hostnamesMap = await upsertUrlHostnames(null, [
      blockedHost,
      `search-unblocked-${suffix}.com`,
    ])
    const blockedHostnameId = hostnamesMap.get(blockedHost)

    if (blockedHostnameId) {
      await updateUrlHostnameBlocked(blockedHostnameId, true)
    }

    const { results: blockedResults } = await searchUrlHostnames({
      blocked: true,
      query: `search-blocked-${suffix}`,
    })
    expect(blockedResults.some(h => h.hostname === blockedHost)).toBe(true)
  })

  it('searchUrlHostnames respects limit', async () => {
    await upsertUrlHostnames(null, [
      `search-limit-${suffix}-1.com`,
      `search-limit-${suffix}-2.com`,
      `search-limit-${suffix}-3.com`,
      `search-limit-${suffix}-4.com`,
      `search-limit-${suffix}-5.com`,
    ])

    const { results } = await searchUrlHostnames({ query: `search-limit-${suffix}`, limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('searchUrlHostnames returns empty array when no matches', async () => {
    const { results } = await searchUrlHostnames({ query: 'nonexistent-hostname-xyz-123' })
    expect(results).toEqual([])
  })

  it('searchUrlHostnames includes descendant topic hostnames when requested', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    const parent = await createTestTopic({ hostname: `hostname-parent-${suffix}.com` })
    const childHostname = `hostname-child-${suffix}.com`
    const otherHostname = `hostname-other-${suffix}.com`
    const child = await createTestTopic({ hostname: childHostname })
    await createTestTopic({ hostname: otherHostname })

    await insertTestTopicParentRelation({
      childTopicId: child.id,
      parentTopicId: parent.id,
      createdById: user.id,
    })

    const { results } = await searchUrlHostnames({
      topic_id: parent.id,
      include_descendants: true,
      query: `hostname-`,
    })

    expect(results.some(h => h.hostname === childHostname)).toBe(true)
    expect(results.some(h => h.hostname === otherHostname)).toBe(false)
  })
})
