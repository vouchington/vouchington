import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  setTestBanEvasionFlag,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@voucha/types/entities/community'
import type { PendingModerationReport } from '../get.mts'
import { attachBanEvasionContext } from '../ban-evasion-context-attach.mts'

function makeUserReport(overrides: Partial<PendingModerationReport> = {}): PendingModerationReport {
  return {
    id: 'report-1',
    case_id: crypto.randomUUID(),
    created_at: new Date('2026-01-01T00:00:00Z'),
    reviewed_at: null,
    reporter_user_id: 'ban-evasion-user-id',
    reporter_username: null,
    entity_type: 'user',
    entity_id: 'user-1',
    reason: 'other',
    note: null,
    status: 'pending',
    resolved_by_id: null,
    is_system_generated: true,
    cursor_created_at: '2026-01-01T00:00:00.000000Z',
    admin_action_path: null,
    target_label: null,
    target_content: null,
    target_path: null,
    target_user_id: null,
    target_available: null,
    target_is_restricted: false,
    report_count: 1,
    cursor_report_count: 1,
    cursor_severity_rank: 0,
    judgement: null,
    post_moderation_context: null,
    ...overrides,
  }
}

describe('attachBanEvasionContext', () => {
  it('returns the same array when no system user reports are present', async () => {
    const nonUserReport = makeUserReport({ entity_type: 'post', is_system_generated: false })
    const result = await attachBanEvasionContext([nonUserReport])
    expect(result).toStrictEqual([nonUserReport])
  })

  describe('with a real ban-evasion flag in DB', () => {
    let owner: PrivateUser
    let suspect: PrivateUser
    let community: Community

    beforeAll(async () => {
      ;[owner, suspect] = await Promise.all([createTestUser(), createTestUser()])
      community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: suspect.id }),
      ])
      await setTestBanEvasionFlag({
        communityId: community.id,
        userId: suspect.id,
        sourceUserId: owner.id,
        score: 0.85,
      })
    })

    it('attaches ban-evasion context to a system user report', async () => {
      const report = makeUserReport({ entity_id: suspect.id })
      const result = await attachBanEvasionContext([report])

      expect(result).toHaveLength(1)
      const enriched = result[0]!
      expect(enriched.community_ban_evasion).not.toBeNull()
      expect(enriched.community_ban_evasion?.community_id).toBe(community.id)
      expect(enriched.community_ban_evasion?.score).toBeCloseTo(0.85, 5)
    })

    it('returns null context when communityId filter does not match any flag', async () => {
      const report = makeUserReport({ entity_id: suspect.id })
      const result = await attachBanEvasionContext([report], {
        communityId: '00000000-0000-0000-0000-000000000000',
      })

      expect(result).toHaveLength(1)
      expect(result[0]!.community_ban_evasion ?? null).toBeNull()
    })
  })

  describe('communityId filter with multiple communities', () => {
    let owner2: PrivateUser
    let suspect2: PrivateUser
    let communityA: Community
    let communityB: Community

    beforeAll(async () => {
      ;[owner2, suspect2] = await Promise.all([createTestUser(), createTestUser()])
      ;[communityA, communityB] = await Promise.all([
        insertTestCommunity({ createdById: owner2.id, visibility: 'public' }),
        insertTestCommunity({ createdById: owner2.id, visibility: 'public' }),
      ])
      await Promise.all([
        insertTestCommunityMember({ communityId: communityA.id, userId: owner2.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: communityA.id, userId: suspect2.id }),
        insertTestCommunityMember({ communityId: communityB.id, userId: owner2.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: communityB.id, userId: suspect2.id }),
      ])
      await setTestBanEvasionFlag({
        communityId: communityA.id,
        userId: suspect2.id,
        sourceUserId: owner2.id,
        score: 0.7,
      })
      await setTestBanEvasionFlag({
        communityId: communityB.id,
        userId: suspect2.id,
        sourceUserId: owner2.id,
        score: 0.9,
      })
    })

    it('returns only the matching community flag when communityId is specified', async () => {
      const report = makeUserReport({ entity_id: suspect2.id })
      const result = await attachBanEvasionContext([report], { communityId: communityA.id })

      expect(result[0]!.community_ban_evasion?.community_id).toBe(communityA.id)
      expect(result[0]!.community_ban_evasion?.score).toBeCloseTo(0.7, 5)
    })

    it('returns the newest flag when no communityId is specified', async () => {
      const report = makeUserReport({ entity_id: suspect2.id })
      const result = await attachBanEvasionContext([report])

      // communityB flag was set after communityA so it is newest
      expect(result[0]!.community_ban_evasion?.community_id).toBe(communityB.id)
    })
  })
})
