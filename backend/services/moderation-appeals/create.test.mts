import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestCommunityBan,
  insertTestCommunity,
  insertTestPost,
  insertTestCommunityPostReview,
  appendTestPlatformRejectionNote,
  updateTestCommunityPostReviewState,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput, type CreateModerationAppealInput } from './parse.mts'
import { listModerationAppeals } from './get.mts'

function createWebAppeal(appellant: PrivateUser, input: CreateModerationAppealInput) {
  return createModerationAppeal(WEB_PROVENANCE, appellant, input)
}

describe('createModerationAppeal', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  describe('post removal target', () => {
    it('creates an appeal for own rejected post', async () => {
      const internalRemovalNote = `Internal removal note ${crypto.randomUUID()}`
      const postId = await insertTestPost({
        title: `Appeal Removal Post ${crypto.randomUUID().slice(0, 8)}`,
        slug: `appeal-removal-${crypto.randomUUID().slice(0, 8)}`,
        createdById: appellant.id,
        markdown: 'My post content',
        clearanceStatus: 'rejected',
      })
      await appendTestPlatformRejectionNote(postId, internalRemovalNote)
      const input = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'My post was wrongly removed.',
      })
      const { appeal, isDuplicate } = await createWebAppeal(appellant, input)

      expect(isDuplicate).toBe(false)
      expect(appeal.post_id).toBe(postId)
      expect(appeal.status).toBe('pending')
      expect(appeal.target_context).toMatchObject({
        type: 'post_removal',
        id: postId,
        kind: 'platform',
        title: expect.stringContaining('Appeal Removal Post'),
        public_reason: null,
        community: null,
      })
      expect(appeal.target_context?.type).toBe('post_removal')
      if (appeal.target_context?.type !== 'post_removal') {
        throw new Error('Expected post removal context')
      }
      expect(appeal.target_context.decided_at).toEqual(expect.any(String))
      expect(appeal.staff_context).toBeDefined()
      expect(appeal.staff_context!.original_decision.internal_reason).toBe(internalRemovalNote)
      expect(appeal.staff_context!.original_decision.actor).toMatchObject({
        id: appellant.id,
        verified_display_name: null,
        profile_image_id: null,
      })
    })

    it('returns the same appeal when removal submissions race', async () => {
      const postId = await insertTestPost({
        title: `Appeal Removal Race ${crypto.randomUUID().slice(0, 8)}`,
        slug: `appeal-removal-race-${crypto.randomUUID().slice(0, 8)}`,
        createdById: appellant.id,
        markdown: 'My post content',
        clearanceStatus: 'rejected',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'Please review this removal.',
      })

      const results = await Promise.all([
        createWebAppeal(appellant, input),
        createWebAppeal(appellant, input),
      ])

      expect(new Set(results.map(result => result.appeal.id)).size).toBe(1)
      expect(results.filter(result => result.isDuplicate)).toHaveLength(1)
    })

    it('stores requested community removal kind when platform rejection also exists', async () => {
      const community = await insertTestCommunity({
        name: `Appeal Both Removal ${crypto.randomUUID().slice(0, 8)}`,
        slug: `appeal-both-removal-${crypto.randomUUID().slice(0, 8)}`,
        createdById: staff.id,
      })
      const postId = await insertTestPost({
        title: `Both Removal Post ${crypto.randomUUID().slice(0, 8)}`,
        slug: `both-removal-post-${crypto.randomUUID().slice(0, 8)}`,
        createdById: appellant.id,
        markdown: 'My post content',
        clearanceStatus: 'rejected',
      })
      await insertTestCommunityPostReview({ communityId: community.id, postId })
      await updateTestCommunityPostReviewState({
        communityId: community.id,
        postId,
        unpublishedAt: new Date(),
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        post_removal_kind: 'community',
        appeal_reason: 'My community removal was wrongly removed.',
      })
      const { appeal, isDuplicate } = await createWebAppeal(appellant, input)

      expect(isDuplicate).toBe(false)
      expect(appeal.post_id).toBe(postId)
      expect(appeal.post_removal_kind).toBe('community')
      expect(appeal.target_context).toMatchObject({
        type: 'post_removal',
        id: postId,
        kind: 'community',
        title: expect.stringContaining('Both Removal Post'),
        public_reason: null,
        community: { id: community.id, name: community.name },
      })
      expect(appeal.target_context?.type).toBe('post_removal')
      if (appeal.target_context?.type !== 'post_removal') {
        throw new Error('Expected post removal context')
      }
      expect(appeal.target_context.decided_at).toEqual(expect.any(String))
      expect(appeal.staff_context).toBeDefined()
      expect(appeal.staff_context!.original_decision.actor).toBeNull()
    })

    it('allows separate pending appeals for different removal kinds on the same post', async () => {
      const community = await insertTestCommunity({
        name: `DupKind Community ${crypto.randomUUID().slice(0, 8)}`,
        slug: `dup-kind-${crypto.randomUUID().slice(0, 8)}`,
        createdById: staff.id,
      })
      const postId = await insertTestPost({
        title: `DupKind Post ${crypto.randomUUID().slice(0, 8)}`,
        slug: `dup-kind-post-${crypto.randomUUID().slice(0, 8)}`,
        createdById: appellant.id,
        markdown: 'Post with both removals',
        clearanceStatus: 'rejected',
      })
      await insertTestCommunityPostReview({ communityId: community.id, postId })
      await updateTestCommunityPostReviewState({
        communityId: community.id,
        postId,
        unpublishedAt: new Date(),
      })

      // File platform removal appeal (rejected_at → default kind = platform)
      const platformInput = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'Platform removal was wrong.',
      })
      const { isDuplicate: dup1 } = await createWebAppeal(appellant, platformInput)
      expect(dup1).toBe(false)

      // File community removal appeal (explicit kind = community)
      const communityInput = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        post_removal_kind: 'community',
        appeal_reason: 'Community removal was wrong.',
      })
      const { isDuplicate: dup2 } = await createWebAppeal(appellant, communityInput)
      expect(dup2).toBe(false)

      // Filing community kind again returns isDuplicate
      const { isDuplicate: dup3 } = await createWebAppeal(appellant, communityInput)
      expect(dup3).toBe(true)
    })

    it('throws 422 when post has not been removed', async () => {
      const postId = await insertTestPost({
        title: `Active Post ${crypto.randomUUID().slice(0, 8)}`,
        slug: `active-post-${crypto.randomUUID().slice(0, 8)}`,
        createdById: appellant.id,
        markdown: 'Active content',
        clearanceStatus: 'approved',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'Trying to appeal non-removed post.',
      })
      await expect(createWebAppeal(appellant, input)).rejects.toMatchObject({ status: 422 })
    })

    it('throws 403 when appealing another user post removal', async () => {
      const other = await createTestUser()
      const postId = await insertTestPost({
        title: `Other Rejected Post ${crypto.randomUUID().slice(0, 8)}`,
        slug: `other-rejected-${crypto.randomUUID().slice(0, 8)}`,
        createdById: other.id,
        markdown: "Other user's content",
        clearanceStatus: 'rejected',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'Not my post.',
      })
      await expect(createWebAppeal(appellant, input)).rejects.toMatchObject({ status: 403 })
    })
  })

  it('enriches multiple target kinds in one bounded list query', async () => {
    const listAppellant = await createTestUser()
    const community = await insertTestCommunity({
      name: `Appeal Context List ${crypto.randomUUID().slice(0, 8)}`,
      slug: `appeal-context-list-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const warning = await insertTestUserWarning({
      userId: listAppellant.id,
      issuedById: staff.id,
      reason: 'List warning reason',
      publicMessage: 'List warning message',
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: listAppellant.id,
      bannedById: staff.id,
      reason: 'List ban reason',
    })
    const postId = await insertTestPost({
      title: `Appeal Context Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `appeal-context-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: listAppellant.id,
      markdown: 'List context post',
      clearanceStatus: 'rejected',
    })

    await createWebAppeal(
      listAppellant,
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'List warning appeal',
      }),
    )
    await createWebAppeal(
      listAppellant,
      parseCreateModerationAppealInput({
        target_type: 'ban',
        target_id: ban.id,
        appeal_reason: 'List ban appeal',
      }),
    )
    await createWebAppeal(
      listAppellant,
      parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'List removal appeal',
      }),
    )

    const { appeals } = await listModerationAppeals({
      appellantUserId: listAppellant.id,
      limit: 10,
    })

    expect(appeals).toHaveLength(3)
    expect(new Set(appeals.map(appeal => appeal.target_context?.type))).toEqual(
      new Set(['warning', 'community_ban', 'post_removal']),
    )
    expect(appeals.every(appeal => appeal.staff_context?.appellant.id === listAppellant.id)).toBe(
      true,
    )
  })

  it('throws for empty appeal_reason', () => {
    expect(() =>
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: crypto.randomUUID(),
        appeal_reason: '',
      }),
    ).toThrow('appeal_reason is required')
  })
})
