import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestTopic,
  createRandomString,
} from '@voucha/test-helpers'
import { searchCommunities } from '../search.mts'
import type { PrivateUser } from '@services/users/types'

describe('searchCommunities – topicIds filter', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns only communities that have the given topic in their list items', async () => {
    const rand = createRandomString(8)

    const [communityA, communityB] = await Promise.all([
      insertTestCommunity({
        createdById: user.id,
        name: `${rand} TF-A`,
        slug: `${rand}-tf-a`,
      }),
      insertTestCommunity({
        createdById: user.id,
        name: `${rand} TF-B`,
        slug: `${rand}-tf-b`,
      }),
    ])

    const topicId = await insertTestTopic({
      name: `Topic Filter ${rand}`,
      slug: `topic-filter-${rand}`,
      createdById: user.id,
    })

    // Only add the topic to communityA
    await insertTestCommunityListItem({
      communityId: communityA.id,
      itemType: 'topic',
      entityId: topicId,
    })

    const result = await searchCommunities({ topicIds: [topicId] })
    const ids = result.results.map(r => r.id)

    expect(ids).toContain(communityA.id)
    expect(ids).not.toContain(communityB.id)
  })

  it('returns metrics and both communities are included when sort=members', async () => {
    const rand = createRandomString(8)

    const [communityC, communityD] = await Promise.all([
      insertTestCommunity({
        createdById: user.id,
        name: `${rand} TF-C`,
        slug: `${rand}-tf-c`,
      }),
      insertTestCommunity({
        createdById: user.id,
        name: `${rand} TF-D`,
        slug: `${rand}-tf-d`,
      }),
    ])

    const topicId = await insertTestTopic({
      name: `Topic Filter Sort ${rand}`,
      slug: `topic-filter-sort-${rand}`,
      createdById: user.id,
    })

    await Promise.all([
      insertTestCommunityListItem({
        communityId: communityC.id,
        itemType: 'topic',
        entityId: topicId,
      }),
      insertTestCommunityListItem({
        communityId: communityD.id,
        itemType: 'topic',
        entityId: topicId,
      }),
    ])

    const result = await searchCommunities({ topicIds: [topicId], sort: 'members' })
    const ids = result.results.map(r => r.id)

    expect(ids).toContain(communityC.id)
    expect(ids).toContain(communityD.id)

    // Metrics should be present for both communities
    expect(result.community_metrics[communityC.id]).toBeDefined()
    expect(result.community_metrics[communityD.id]).toBeDefined()

    // Result must be ordered by member_count descending
    const memberCounts = result.results.map(r => result.community_metrics[r.id]?.member_count ?? 0)
    for (let i = 0; i < memberCounts.length - 1; i++) {
      expect(memberCounts[i]).toBeGreaterThanOrEqual(memberCounts[i + 1]!)
    }
  })

  it('returns no results when no community has the topic', async () => {
    const rand = createRandomString(8)

    const unrelatedTopic = await insertTestTopic({
      name: `Unrelated Topic ${rand}`,
      slug: `unrelated-topic-${rand}`,
      createdById: user.id,
    })

    const result = await searchCommunities({ topicIds: [unrelatedTopic], search: rand })
    expect(result.results).toHaveLength(0)
  })
})
