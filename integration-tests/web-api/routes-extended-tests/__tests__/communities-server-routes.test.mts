import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import * as serverRoutes from '@/lib/api/server'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../../backend/test-helpers/index.mts'
import { installRoutesExtendedHarness } from '../../../test-helpers/routes-extended-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('routes-extended', () => {
  let communitySlug: string
  let communitySearchToken: string
  let communityId: string

  const harness = installRoutesExtendedHarness({
    unset,
    workerSecret: 'always',
    async seedCommunity(adminId) {
      communitySearchToken = randomUUID().replace(/-/g, '')
      const community = await insertTestCommunity({
        createdById: adminId,
        name: `Extended Routes Community ${communitySearchToken}`,
        slug: `ext-routes-community-${communitySearchToken}`,
      })
      communitySlug = community.slug
      communityId = community.id
      await insertTestCommunityMember({
        communityId: community.id,
        userId: adminId,
        role: 'owner',
      })
    },
  })

  describe('communities server routes', () => {
    it('getCommunities includes the created community', async () => {
      // Scope the search to a pure-alphanumeric token unique to this fixture:
      // getCommunities() defaults to page one (20 communities, sorted by name), so on a DB
      // that has accumulated more than 20 randomly named `Test Community ...` fixtures, an
      // unscoped query would flake on unrelated test-run history rather than a real bug.
      // Searching by the full hyphenated slug instead of this token would reintroduce the
      // same flake risk: websearch_to_tsquery splits hyphenated compound words into
      // sub-lexemes (see the "hyphen issues" note in
      // backend/services/communities/__tests__/search.sort.test.mts), so a query for
      // `ext-routes-community-<token>` can match on just the shared `community` part and pull
      // in every other `Test Community`/`ext-routes-community` fixture again.
      const result = await serverRoutes.getCommunities({
        searchParams: { q: communitySearchToken },
      })
      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.id).toBe(communityId)
      expect(result.communities[communityId]?.slug).toBe(communitySlug)
    })

    it('getCommunity resolves the created community', async () => {
      const result = await serverRoutes.getCommunity(communitySlug)
      expect(result).not.toBeNull()
      expect(result?.community.id).toBe(communityId)
    })

    it('getCommunityMembers returns the owner membership', async () => {
      const result = await serverRoutes.getCommunityMembers(communitySlug, {
        headers: harness.adminCookieHeader,
      })
      expect(result.results).toHaveLength(1)
      expect(result.community_members[result.results[0]!.id]?.user_id).toBe(harness.admin.id)
    })

    it('getCommunityPosts returns an empty result for a community with no posts', async () => {
      const result = await serverRoutes.getCommunityPosts(communitySlug)
      expect(result.results).toEqual([])
    })

    it('getCommunityPendingPosts returns an empty result for a community with no pending posts', async () => {
      const result = await serverRoutes.getCommunityPendingPosts(communitySlug, {
        headers: harness.adminCookieHeader,
      })
      expect(result.results).toEqual([])
    })

    it('getCommunityApplicationQuestions returns an empty result for a community with no questions', async () => {
      const result = await serverRoutes.getCommunityApplicationQuestions(communitySlug)
      expect(result.questions).toEqual([])
    })

    it('getCommunityApplications returns an empty result for a community with no applications', async () => {
      const result = await serverRoutes.getCommunityApplications(communitySlug, {
        headers: harness.adminCookieHeader,
      })
      expect(result.results).toEqual([])
    })

    it('getCommunityInvites returns an empty result for a community with no invites', async () => {
      const result = await serverRoutes.getCommunityInvites(communitySlug, {
        headers: harness.adminCookieHeader,
      })
      expect(result.results).toEqual([])
    })
  })
})
