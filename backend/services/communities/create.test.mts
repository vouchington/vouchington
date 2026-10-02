import { it, expect, beforeAll, describe } from 'vitest'
import {
  WEB_PROVENANCE,
  createTestUser,
  insertTestCommunity,
  createTestMembership,
  insertTestImage,
  getTestImageSurfacePlacements,
} from '@voucha/test-helpers'
import { createCommunity } from './create.mts'
import { getCommunity } from './get.mts'
import type { PrivateUser } from '@services/users/types'

describe('create', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    // Grant Pro so the shared user has a plan (used by post-related features in other tests).
    await createTestMembership({ user_id: user.id, plan: 'pro' })
  })

  describe('createCommunity', () => {
    it('reserves both image surfaces before applying their owner fields', async () => {
      const [profileImageId, bannerImageId] = await Promise.all([
        insertTestImage(user.id),
        insertTestImage(user.id),
      ])
      const community = await createCommunity(user.id, WEB_PROVENANCE, {
        name: `Reserved Image Community ${crypto.randomUUID()}`,
        profile_image_id: profileImageId,
        banner_image_id: bannerImageId,
      })
      expect(community.profile_image_id).toBe(profileImageId)
      expect(community.banner_image_id).toBe(bannerImageId)
      const placements = await getTestImageSurfacePlacements({ communityId: community.id })
      expect(placements.map(row => row.image_id)).toEqual(
        expect.arrayContaining([profileImageId, bannerImageId]),
      )
    })

    it('creates a community and makes creator the owner', async () => {
      const community = await createCommunity(user.id, WEB_PROVENANCE, {
        name: 'Test Community Create',
        slug: `test-community-create-${Date.now()}`,
      })

      expect(community.name).toBe('Test Community Create')
      expect(community.created_by_id).toBe(user.id)
      expect(community.visibility).toBe('public')
      expect(community.deleted_at).toBeNull()
    })

    it('auto-generates slug from name with a base36 suffix', async () => {
      const ts = Date.now()
      const community = await createCommunity(user.id, WEB_PROVENANCE, {
        name: `My Auto Slug Community ${ts}`,
      })

      // Slug should start with the name slug and end with a base36 random suffix
      expect(community.slug).toMatch(/^my-auto-slug-community-\d+-[a-z0-9]+$/)
    })

    it('two communities with the same name get different slugs', async () => {
      const name = 'Shared Name Community Test'
      const [a, b] = await Promise.all([
        createCommunity(user.id, WEB_PROVENANCE, { name }),
        createCommunity(user.id, WEB_PROVENANCE, { name }),
      ])
      expect(a.slug).not.toBe(b.slug)
    })

    it('rejects duplicate slug', async () => {
      const slug = `dup-slug-${Date.now()}`
      await createCommunity(user.id, WEB_PROVENANCE, { name: 'First Test Community', slug })

      await expect(
        createCommunity(user.id, WEB_PROVENANCE, { name: 'Second Test Community', slug }),
      ).rejects.toMatchObject({ status: 409 })
    })

    it('rejects name with leading whitespace', async () => {
      await expect(
        createCommunity(user.id, WEB_PROVENANCE, { name: ' Bad Name Again' }),
      ).rejects.toMatchObject({
        status: 422,
      })
    })

    it('rejects empty name', async () => {
      await expect(createCommunity(user.id, WEB_PROVENANCE, { name: '' })).rejects.toMatchObject({
        status: 422,
      })
    })

    it('rejects a name with fewer than 3 words', async () => {
      await expect(
        createCommunity(user.id, WEB_PROVENANCE, { name: 'Only Two' }),
      ).rejects.toMatchObject({
        status: 422,
        message: 'Community name must have at least 3 words',
      })
    })

    it('rejects a single-word name', async () => {
      await expect(
        createCommunity(user.id, WEB_PROVENANCE, { name: 'OneWord' }),
      ).rejects.toMatchObject({
        status: 422,
      })
    })

    it('accepts a name with exactly 3 words', async () => {
      const ts = Date.now()
      const community = await createCommunity(user.id, WEB_PROVENANCE, {
        name: `Exactly Three Words ${ts}`,
      })
      expect(community.name).toBe(`Exactly Three Words ${ts}`)
    })

    it('any user can create multiple communities', async () => {
      const freeUser = await createTestUser()
      const ts = Date.now()
      const [c1, c2] = await Promise.all([
        createCommunity(freeUser.id, WEB_PROVENANCE, { name: `Free Limit First ${ts}` }),
        createCommunity(freeUser.id, WEB_PROVENANCE, { name: `Free Limit Second ${ts}` }),
      ])
      expect(c1.created_by_id).toBe(freeUser.id)
      expect(c2.created_by_id).toBe(freeUser.id)
    })
  })

  describe('getCommunity', () => {
    it('fetches community by id', async () => {
      const inserted = await insertTestCommunity({ createdById: user.id })
      const found = await getCommunity(inserted.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(inserted.id)
    })

    it('fetches community by slug', async () => {
      const inserted = await insertTestCommunity({ createdById: user.id })
      const found = await getCommunity(inserted.slug)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(inserted.id)
    })

    it('returns null for non-existent community', async () => {
      const found = await getCommunity('00000000-0000-0000-0000-000000000000')
      expect(found).toBeNull()
    })

    it('includes owner info', async () => {
      const inserted = await insertTestCommunity({ createdById: user.id })
      const found = await getCommunity(inserted.id)
      expect(found).not.toBeNull()
      expect(found!.owner).not.toBeNull()
      expect(found!.owner!.id).toBe(user.id)
      expect(found!.owner!.username).toBe(user.username)
    })
  })
})
