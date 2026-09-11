import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestProxyFollowCommunity,
  insertTestProxyMuteCommunity,
  createRandomString,
} from '@voucha/test-helpers'
import { searchCommunities } from '../search.mts'
import type { PrivateUser } from '@services/users/types'

describe('search (sort)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('searchCommunities', () => {
    describe('sort=name (default)', () => {
      it('returns results with page_info', async () => {
        await insertTestCommunity({ createdById: user.id })

        const result = await searchCommunities({ sort: 'name' })
        expect(Array.isArray(result.results)).toBe(true)
        expect(result.page_info).toBeDefined()
        expect(result.community_metrics).toBeDefined()
      })

      it('paginates using name cursor', async () => {
        // Use pure alphanumeric for search to avoid websearch_to_tsquery hyphen issues
        const rand = createRandomString(8)
        const [c1, c2] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Alpha`,
            slug: `${rand}-alpha`,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Beta`,
            slug: `${rand}-beta`,
          }),
        ])

        const page1 = await searchCommunities({ sort: 'name', limit: 1, search: rand })
        expect(page1.results.length).toBeGreaterThanOrEqual(1)
        expect(page1.page_info.has_next_page).toBe(true)
        // Alpha < Beta alphabetically, so first page should be c1
        expect(page1.results[0]!.id).toBe(c1.id)

        const page2 = await searchCommunities({
          sort: 'name',
          limit: 1,
          after: page1.page_info.end_cursor!,
          search: rand,
        })
        expect(page2.results.length).toBeGreaterThanOrEqual(1)
        expect(page2.results[0]!.id).toBe(c2.id)
      })
    })

    describe('sort=members', () => {
      it('returns community_metrics and orders by member_count desc', async () => {
        const rand = createRandomString(8)
        const [communityFew, communityMany] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Few`,
            slug: `${rand}-few`,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Many`,
            slug: `${rand}-many`,
          }),
        ])

        // Add several members to communityMany
        const members = await Promise.all(Array.from({ length: 5 }, () => createTestUser()))
        await Promise.all(
          members.map(m =>
            insertTestCommunityMember({ communityId: communityMany.id, userId: m!.id }),
          ),
        )

        const result = await searchCommunities({
          sort: 'members',
          limit: 100,
          search: rand,
        })

        expect(result.community_metrics).toBeDefined()
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(communityMany.id)
        expect(ids).toContain(communityFew.id)
        expect(ids.indexOf(communityMany.id)).toBeLessThan(ids.indexOf(communityFew.id))

        // Verify metrics are present for each result
        for (const community of result.results) {
          expect(result.community_metrics![community.id]).toBeDefined()
        }
      })

      it('paginates using score cursor', async () => {
        const rand = createRandomString(8)
        const [c1, c2] = await Promise.all([
          insertTestCommunity({ createdById: user.id, name: `${rand} One`, slug: `${rand}-one` }),
          insertTestCommunity({ createdById: user.id, name: `${rand} Two`, slug: `${rand}-two` }),
        ])

        // Give c1 more members
        const extraMembers = await Promise.all(Array.from({ length: 3 }, () => createTestUser()))
        await Promise.all(
          extraMembers.map(m => insertTestCommunityMember({ communityId: c1.id, userId: m!.id })),
        )

        const page1 = await searchCommunities({ sort: 'members', limit: 1, search: rand })
        expect(page1.results.length).toBe(1)
        expect(page1.results[0]!.id).toBe(c1.id)
        expect(page1.page_info.has_next_page).toBe(true)

        const page2 = await searchCommunities({
          sort: 'members',
          limit: 1,
          after: page1.page_info.end_cursor!,
          search: rand,
        })
        expect(page2.results.length).toBe(1)
        expect(page2.results[0]!.id).toBe(c2.id)
      })
    })

    describe('sort=virtual_subscriptions', () => {
      it('orders by virtual_subscription_count desc and returns metrics', async () => {
        const rand = createRandomString(8)
        const [communityFew, communityMany] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} SubFew`,
            slug: `${rand}-subfew`,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} SubMany`,
            slug: `${rand}-submany`,
          }),
        ])

        const subscribers = await Promise.all(Array.from({ length: 4 }, () => createTestUser()))
        await Promise.all([
          insertTestProxyFollowCommunity(subscribers[0]!.id, communityMany.id),
          insertTestProxyFollowCommunity(subscribers[1]!.id, communityMany.id),
          insertTestProxyMuteCommunity(subscribers[2]!.id, communityMany.id),
          insertTestProxyMuteCommunity(subscribers[3]!.id, communityMany.id),
        ])

        const result = await searchCommunities({
          sort: 'virtual_subscriptions',
          limit: 100,
          search: rand,
        })

        expect(result.community_metrics).toBeDefined()
        const ids = result.results.map(r => r.id)
        expect(ids.indexOf(communityMany.id)).toBeLessThan(ids.indexOf(communityFew.id))

        const manyMetrics = result.community_metrics![communityMany.id]!
        expect(manyMetrics.virtual_subscription_count).toBeGreaterThanOrEqual(4)
        expect(manyMetrics.proxy_follow_count).toBeGreaterThanOrEqual(2)
        expect(manyMetrics.proxy_mute_count).toBeGreaterThanOrEqual(2)
      })
    })
  })
})
