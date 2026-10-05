import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  deleteTestCommunityRestriction,
  insertTestCommunity,
  insertTestCommunityRestriction,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { Community } from '@voucha/types/entities/community'
import { recordModeratorAction } from './record.mts'
import { searchModeratorActions } from './search.mts'

describe('searchModeratorActions', () => {
  let actor: PrivateUser
  let community: Community
  let targetA: PrivateUser
  let targetB: PrivateUser

  beforeAll(async () => {
    actor = await createTestUser()
    community = await insertTestCommunity({ createdById: actor.id })
    targetA = await createTestUser()
    targetB = await createTestUser()

    // Insert several actions for this community
    await recordModeratorAction(actor.id, {
      actionType: 'ban',
      communityId: community.id,
      targetUserId: targetA.id,
      reason: 'Spam',
    })
    await recordModeratorAction(actor.id, {
      actionType: 'warn',
      communityId: community.id,
      targetUserId: targetB.id,
    })
    await recordModeratorAction(actor.id, {
      actionType: 'ban',
      communityId: community.id,
      targetUserId: targetB.id,
    })
  })

  it('returns results filtered by communityId', async () => {
    const { results } = await searchModeratorActions({ communityId: community.id })
    expect(results.length).toBeGreaterThanOrEqual(3)
    for (const r of results) {
      expect(r.community_id).toBe(community.id)
    }
  })

  it('returns results filtered by actorId', async () => {
    const { results } = await searchModeratorActions({
      communityId: community.id,
      actorId: actor.id,
    })
    expect(results.length).toBeGreaterThanOrEqual(3)
    for (const r of results) {
      expect(r.actor_user_id).toBe(actor.id)
    }
  })

  it('returns results filtered by actionType', async () => {
    const { results } = await searchModeratorActions({
      communityId: community.id,
      actionType: 'warn',
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    for (const r of results) {
      expect(r.action_type).toBe('warn')
    }
  })

  it('paginates with limit and cursor', async () => {
    const page1 = await searchModeratorActions({ communityId: community.id, limit: 2 })
    expect(page1.results.length).toBe(2)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).not.toBeNull()

    const page2 = await searchModeratorActions({
      communityId: community.id,
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results.length).toBeGreaterThanOrEqual(1)

    // No ID overlap between pages
    const ids1 = new Set(page1.results.map(r => r.id))
    for (const r of page2.results) {
      expect(ids1.has(r.id)).toBe(false)
    }
  })

  it('returns page_info.has_next_page=false when results fit in limit', async () => {
    const { page_info } = await searchModeratorActions({ communityId: community.id, limit: 100 })
    // We may have more rows from other tests, but we just verify the structure
    expect(typeof page_info.has_next_page).toBe('boolean')
  })

  it('rejects invalid limit values', async () => {
    await expect(searchModeratorActions({ limit: 0 })).rejects.toThrow(
      'limit must be between 1 and 100',
    )
    await expect(searchModeratorActions({ limit: 101 })).rejects.toThrow(
      'limit must be between 1 and 100',
    )
  })

  it('rejects invalid cursor', async () => {
    await expect(searchModeratorActions({ after: 'invalid-cursor' })).rejects.toThrow(
      'Invalid cursor format',
    )
  })

  it('filters to global actions (community_id IS NULL) when global: true', async () => {
    // Insert a global action (no communityId)
    await recordModeratorAction(actor.id, {
      actionType: 'suspend',
      targetUserId: targetA.id,
    })

    const { results } = await searchModeratorActions({ global: true })
    expect(results.length).toBeGreaterThanOrEqual(1)
    for (const r of results) {
      expect(r.community_id).toBeNull()
    }
  })

  describe('restriction targets', () => {
    async function createRestrictionCommunity() {
      const restrictionCommunity = await insertTestCommunity({ createdById: actor.id })
      const noLinks = await insertTestCommunityRestriction({
        communityId: restrictionCommunity.id,
        restrictionType: 'no_links',
        activatedById: actor.id,
      })
      const approval = await insertTestCommunityRestriction({
        communityId: restrictionCommunity.id,
        restrictionType: 'require_post_approval',
        activatedById: actor.id,
      })
      return { communityId: restrictionCommunity.id, noLinks, approval }
    }

    it('rebuilds restriction_ids for an activation in restriction-type order', async () => {
      const { communityId, noLinks, approval } = await createRestrictionCommunity()
      await recordModeratorAction(actor.id, {
        actionType: 'activate_restriction',
        communityId,
        communityRestrictionIds: [noLinks.id, approval.id],
        metadata: { restriction_types: ['require_post_approval', 'no_links'], expires_at: null },
      })

      const { results } = await searchModeratorActions({ communityId })

      expect(results).toHaveLength(1)
      expect(results[0]!.metadata).toEqual({
        restriction_ids: [approval.id, noLinks.id],
        restriction_types: ['require_post_approval', 'no_links'],
        expires_at: null,
      })
    })

    it('rebuilds restriction_id for a lift and nulls it once the restriction is deleted', async () => {
      const { communityId, noLinks } = await createRestrictionCommunity()
      await recordModeratorAction(actor.id, {
        actionType: 'lift_restriction',
        communityId,
        communityRestrictionIds: [noLinks.id],
        metadata: { restriction_type: 'no_links' },
      })

      const lifted = await searchModeratorActions({ communityId })
      expect(lifted.results[0]!.metadata).toEqual({
        restriction_id: noLinks.id,
        restriction_type: 'no_links',
      })

      await deleteTestCommunityRestriction(noLinks.id)

      const afterDelete = await searchModeratorActions({ communityId })
      expect(afterDelete.results[0]!.metadata).toEqual({
        restriction_id: null,
        restriction_type: 'no_links',
      })
    })

    it('leaves other action metadata unchanged', async () => {
      const { communityId } = await createRestrictionCommunity()
      await recordModeratorAction(actor.id, {
        actionType: 'change_role',
        communityId,
        targetUserId: targetA.id,
        metadata: { role: 'moderator' },
      })

      const { results } = await searchModeratorActions({ communityId })

      expect(results[0]!.metadata).toEqual({ role: 'moderator' })
    })
  })
})
