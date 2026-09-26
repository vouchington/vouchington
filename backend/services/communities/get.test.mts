import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  setCommunityLanguageDetectionFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  getCommunityBySlugOnly,
  getCommunityOrThrow,
  loadCommunityForViewer,
  loadCommunityForViewerOrApplicant,
  loadCommunityForModerator,
} from './get.mts'
import { createApplication } from './applications/create.mts'

describe('get', () => {
  const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

  let owner: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })

  describe('getCommunityOrThrow', () => {
    it('returns the community when found by id', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      const community = await getCommunityOrThrow(inserted.id)
      expect(community.id).toBe(inserted.id)
    })

    it('returns the community when found by slug', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      const community = await getCommunityOrThrow(inserted.slug)
      expect(community.id).toBe(inserted.id)
    })

    it('returns only the declared community columns, owner, and image placements', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      await setCommunityLanguageDetectionFieldsForTest(inserted.id)

      const communities = await Promise.all([
        getCommunityOrThrow(inserted.id),
        getCommunityOrThrow(inserted.slug),
        getCommunityBySlugOnly(inserted.slug),
      ])

      expect(communities[0].lingua_rs_detected_language).toBe('fr')
      const expectedKeys = [
        'allow_data_point_posts',
        'allow_review_posts',
        'archived_at',
        'archived_by_id',
        'banner_image_id',
        'banner_image_placement',
        'created_at',
        'created_by_id',
        'default_language',
        'deleted_at',
        'deleted_by_id',
        'id',
        'lingua_rs_detected_language',
        'list_type',
        'markdown',
        'member_invites_allowed_at',
        'member_roster_visibility',
        'name',
        'owner',
        'post_approval_required_at',
        'profile_image_id',
        'profile_image_placement',
        'rules_markdown',
        'slug',
        'trusted_at',
        'updated_at',
        'visibility',
      ]
      expect(communities.map(community => Object.keys(community!).sort())).toEqual([
        expectedKeys,
        expectedKeys,
        expectedKeys,
      ])
    })

    it('throws 404 when not found', async () => {
      await expect(getCommunityOrThrow(NON_EXISTENT_UUID)).rejects.toMatchObject({
        status: 404,
        message: 'Community not found',
      })
    })
  })

  describe('loadCommunityForViewer', () => {
    it('returns membership: null for an anonymous viewer of a public community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      const result = await loadCommunityForViewer(null, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership).toBeNull()
    })

    it('returns membership: null for a signed-in non-member of a public community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      const stranger = await createTestUser()
      const result = await loadCommunityForViewer(stranger, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership).toBeNull()
    })

    it('returns the membership for a signed-in member of a public community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      const member = await createTestUser()
      await insertTestCommunityMember({ communityId: inserted.id, userId: member.id })
      const result = await loadCommunityForViewer(member, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership?.user_id).toBe(member.id)
    })

    it('throws 404 for an anonymous viewer of a private community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      await expect(loadCommunityForViewer(null, inserted.id)).rejects.toMatchObject({
        status: 404,
        message: 'Community not found',
      })
    })

    it('throws 404 for a signed-in non-member of a private community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      const stranger = await createTestUser()
      await expect(loadCommunityForViewer(stranger, inserted.id)).rejects.toMatchObject({
        status: 404,
        message: 'Community not found',
      })
    })

    it('still throws 404 for a signed-in applicant of a private community (content routes stay gated)', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      await insertTestCommunityMember({ communityId: inserted.id, userId: owner.id, role: 'owner' })
      const applicant = await createTestUser()
      await createApplication(WEB_PROVENANCE, applicant.id, inserted.id, {})
      await expect(loadCommunityForViewer(applicant, inserted.id)).rejects.toMatchObject({
        status: 404,
        message: 'Community not found',
      })
    })

    it('returns for a signed-in member of a private community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      const member = await createTestUser()
      await insertTestCommunityMember({ communityId: inserted.id, userId: member.id })
      const result = await loadCommunityForViewer(member, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership?.user_id).toBe(member.id)
    })

    it('returns for an administrator without a membership', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      const result = await loadCommunityForViewer(admin, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership).toBeNull()
    })

    it('throws 404 for a removed member of a private community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      const member = await createTestUser()
      await insertTestCommunityMember({ communityId: inserted.id, userId: member.id })
      await removeTestCommunityMember(inserted.id, member.id)
      await expect(loadCommunityForViewer(member, inserted.id)).rejects.toMatchObject({
        status: 404,
      })
    })

    it('throws 404 when the community does not exist', async () => {
      await expect(loadCommunityForViewer(null, NON_EXISTENT_UUID)).rejects.toMatchObject({
        status: 404,
        message: 'Community not found',
      })
    })
  })

  describe('loadCommunityForViewerOrApplicant', () => {
    it('allows an applicant to view a private community', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      await insertTestCommunityMember({ communityId: inserted.id, userId: owner.id, role: 'owner' })
      const applicant = await createTestUser()
      await createApplication(WEB_PROVENANCE, applicant.id, inserted.id, {})
      const result = await loadCommunityForViewerOrApplicant(applicant, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership).toBeNull()
      expect(result.hasPendingApplication).toBe(true)
    })

    it('throws 404 for a stranger without a pending application', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      const stranger = await createTestUser()
      await expect(loadCommunityForViewerOrApplicant(stranger, inserted.id)).rejects.toMatchObject({
        status: 404,
        message: 'Community not found',
      })
    })
  })

  describe('loadCommunityForModerator', () => {
    it('throws 403 for a non-member', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      const stranger = await createTestUser()
      await expect(loadCommunityForModerator(stranger, inserted.id)).rejects.toMatchObject({
        status: 403,
        message: 'Forbidden',
      })
    })

    it('throws 403 for a regular member', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      const member = await createTestUser()
      await insertTestCommunityMember({
        communityId: inserted.id,
        userId: member.id,
        role: 'member',
      })
      await expect(loadCommunityForModerator(member, inserted.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('returns for a moderator', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      const moderator = await createTestUser()
      await insertTestCommunityMember({
        communityId: inserted.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const result = await loadCommunityForModerator(moderator, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership?.role).toBe('moderator')
    })

    it('returns for an owner', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({ communityId: inserted.id, userId: owner.id, role: 'owner' })
      const result = await loadCommunityForModerator(owner, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership?.role).toBe('owner')
    })

    it('returns for an administrator without a membership', async () => {
      const inserted = await insertTestCommunity({ createdById: owner.id })
      const result = await loadCommunityForModerator(admin, inserted.id)
      expect(result.community.id).toBe(inserted.id)
      expect(result.membership).toBeNull()
    })

    it('throws 404 when the community does not exist', async () => {
      await expect(loadCommunityForModerator(owner, NON_EXISTENT_UUID)).rejects.toMatchObject({
        status: 404,
        message: 'Community not found',
      })
    })
  })
})
