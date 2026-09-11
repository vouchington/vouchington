import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestUserWarning,
  softDeleteUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { revokeUserWarning } from '@services/user-warnings'
import { createModerationAppeal } from './create.mts'
import { getModerationAppealByIdFromPrimary } from './get.mts'
import { parseCreateModerationAppealInput } from './parse.mts'

describe('createModerationAppeal warning and ban targets', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  describe('warning target', () => {
    it('creates an appeal for own warning', async () => {
      const warning = await insertTestUserWarning({
        userId: appellant.id,
        issuedById: staff.id,
        reason: 'spam',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'I did not spam, this was legitimate content.',
      })
      const { appeal, isDuplicate } = await createModerationAppeal(appellant, input)

      expect(isDuplicate).toBe(false)
      expect(appeal.appellant_id).toBe(appellant.id)
      expect(appeal.user_warning_id).toBe(warning.id)
      expect(appeal.status).toBe('pending')
      expect(appeal.appeal_reason).toBe('I did not spam, this was legitimate content.')
      expect(appeal.target_context).toMatchObject({
        type: 'warning',
        id: warning.id,
        public_message: null,
        community: null,
      })
      expect(appeal.target_context?.type).toBe('warning')
      if (appeal.target_context?.type !== 'warning') throw new Error('Expected warning context')
      expect(appeal.target_context.created_at).toEqual(expect.any(String))
      expect(appeal.staff_context).toEqual({
        appellant: {
          id: appellant.id,
          username: appellant.username ?? null,
          verified_display_name: null,
          profile_image_id: null,
        },
        original_decision: {
          internal_reason: 'spam',
          actor: {
            id: staff.id,
            username: staff.username ?? null,
            verified_display_name: null,
            profile_image_id: null,
          },
        },
      })
    })

    it('returns isDuplicate true on duplicate pending warning appeal', async () => {
      const warning = await insertTestUserWarning({
        userId: appellant.id,
        issuedById: staff.id,
        reason: 'harassment',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'First attempt.',
      })
      await createModerationAppeal(appellant, input)
      const { appeal, isDuplicate } = await createModerationAppeal(appellant, {
        ...input,
        appealReason: 'Second attempt.',
      })
      expect(isDuplicate).toBe(true)
      expect(appeal.created_at).toBeInstanceOf(Date)
      expect(appeal.target_context).toMatchObject({
        type: 'warning',
        id: warning.id,
      })
      expect(appeal.staff_context?.original_decision).toMatchObject({
        internal_reason: 'harassment',
        actor: { id: staff.id },
      })
    })

    it('preserves the decision actor id after the public user projection disappears', async () => {
      const removedActor = await createTestUser()
      const warning = await insertTestUserWarning({
        userId: appellant.id,
        issuedById: removedActor.id,
        reason: 'decision actor retention',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'Please review this warning.',
      })
      const { appeal } = await createModerationAppeal(appellant, input)

      await softDeleteUser(removedActor.id)
      const refreshed = await getModerationAppealByIdFromPrimary(appeal.id)

      expect(refreshed?.staff_context?.original_decision.actor).toEqual({
        id: removedActor.id,
        username: null,
        verified_display_name: null,
        profile_image_id: null,
      })
    })

    it('throws 403 when appealing another user warning', async () => {
      const other = await createTestUser()
      const warning = await insertTestUserWarning({
        userId: other.id,
        issuedById: staff.id,
        reason: 'spam',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'Not my warning.',
      })
      await expect(createModerationAppeal(appellant, input)).rejects.toMatchObject({ status: 403 })
    })

    it('throws 404 for a revoked warning', async () => {
      const warning = await insertTestUserWarning({
        userId: appellant.id,
        issuedById: staff.id,
        reason: 'spam',
      })
      await revokeUserWarning(staff.id, warning.id)
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'Revoked warning appeal.',
      })
      await expect(createModerationAppeal(appellant, input)).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('ban target', () => {
    it('creates an appeal for own community ban', async () => {
      const community = await insertTestCommunity({
        name: `Appeal Ban Community ${crypto.randomUUID().slice(0, 8)}`,
        slug: `appeal-ban-${crypto.randomUUID().slice(0, 8)}`,
        createdById: staff.id,
      })
      const ban = await insertTestCommunityBan({
        communityId: community.id,
        userId: appellant.id,
        bannedById: staff.id,
        reason: 'Repeated violations',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'ban',
        target_id: ban.id,
        appeal_reason: 'I understand the rules better now.',
      })
      const { appeal, isDuplicate } = await createModerationAppeal(appellant, input)

      expect(isDuplicate).toBe(false)
      expect(appeal.community_ban_id).toBe(ban.id)
      expect(appeal.community_id).toBe(community.id)
      expect(appeal.status).toBe('pending')
      expect(appeal.target_context).toMatchObject({
        type: 'community_ban',
        id: ban.id,
        reason: 'Repeated violations',
        expires_at: null,
        community: { id: community.id, name: community.name },
      })
      expect(appeal.target_context?.type).toBe('community_ban')
      if (appeal.target_context?.type !== 'community_ban') {
        throw new Error('Expected community ban context')
      }
      expect(appeal.target_context.created_at).toEqual(expect.any(String))
    })

    it('returns the same appeal when ban submissions race', async () => {
      const community = await insertTestCommunity({
        name: `Appeal Ban Race ${crypto.randomUUID().slice(0, 8)}`,
        slug: `appeal-ban-race-${crypto.randomUUID().slice(0, 8)}`,
        createdById: staff.id,
      })
      const ban = await insertTestCommunityBan({
        communityId: community.id,
        userId: appellant.id,
        bannedById: staff.id,
        reason: 'Repeated violations',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'ban',
        target_id: ban.id,
        appeal_reason: 'Please review this ban.',
      })

      const results = await Promise.all([
        createModerationAppeal(appellant, input),
        createModerationAppeal(appellant, input),
      ])

      expect(new Set(results.map(result => result.appeal.id)).size).toBe(1)
      expect(results.filter(result => result.isDuplicate)).toHaveLength(1)
    })

    it('throws 403 when appealing another user ban', async () => {
      const other = await createTestUser()
      const community = await insertTestCommunity({
        name: `Other Ban Community ${crypto.randomUUID().slice(0, 8)}`,
        slug: `other-ban-${crypto.randomUUID().slice(0, 8)}`,
        createdById: staff.id,
      })
      const ban = await insertTestCommunityBan({
        communityId: community.id,
        userId: other.id,
        bannedById: staff.id,
        reason: 'Violations',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'ban',
        target_id: ban.id,
        appeal_reason: 'Not my ban.',
      })
      await expect(createModerationAppeal(appellant, input)).rejects.toMatchObject({ status: 403 })
    })
  })
})
