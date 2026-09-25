import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestRssFeedItem,
  insertTestUrl,
  insertTestUrlHostname,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createRandomString,
  createEntityRelationWithElection,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

import { createHash } from 'node:crypto'

describe('community', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('Community Individual Routes', () => {
    describe('PATCH /api/v1/communities/:slug', () => {
      it('returns 401 without auth', async () => {
        const patchAuthor = await createTestUser()
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: patchAuthor.id,
          slug: `community-patch-401-${random}`,
        })

        const request = createRequest()
        await request
          .patch(`/api/v1/communities/${community.slug}`)
          .set('Content-Type', 'application/json')
          .send({ name: 'Updated' })
          .expect(401)
      })

      it('returns 403 as non-owner', async () => {
        const [owner, other] = await Promise.all([createTestUser(), createTestUser()])
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner!.id,
          slug: `community-patch-403-${random}`,
        })

        const request = createRequest()
        await request.authenticateAs(other!)

        await request
          .patch(`/api/v1/communities/${community.slug}`)
          .set('Content-Type', 'application/json')
          .send({ name: 'Updated' })
          .expect(403)
      })

      it('updates and returns 200 as owner', async () => {
        const patchUser = await createTestUser()
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: patchUser.id,
          slug: `community-patch-ok-${random}`,
          name: `Original Name ${random}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: patchUser.id,
          role: 'owner',
        })

        const request = createRequest()
        await request.authenticateAs(patchUser)

        const updatedName = `Updated Name ${random}`
        const response = await request
          .patch(`/api/v1/communities/${community.slug}`)
          .set('Content-Type', 'application/json')
          .send({ name: updatedName })
          .expect(200)

        expect(response.body.community.name).toBe(updatedName)
      })

      it('returns exactly the community contract fields from PATCH and GET', async () => {
        const patchUser = await createTestUser()
        const community = await insertTestCommunity({ createdById: patchUser.id })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: patchUser.id,
          role: 'owner',
        })

        const request = createRequest()
        await request.authenticateAs(patchUser)

        const patched = await request
          .patch(`/api/v1/communities/${community.slug}`)
          .set('Content-Type', 'application/json')
          .send({ name: `Contract Name ${createRandomString(8)}` })
          .expect(200)
        const shown = await request.get(`/api/v1/communities/${community.slug}`).expect(200)

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
          'post_approval_required_at',
          'profile_image_id',
          'profile_image_placement',
          'rules_markdown',
          'slug',
          'trusted_at',
          'updated_at',
          'visibility',
        ]
        expect(Object.keys(patched.body.community).sort()).toEqual(expectedKeys)
        expect(Object.keys(shown.body.community).sort()).toEqual(expectedKeys)
      })

      it('updates list_type to follow', async () => {
        const patchUser = await createTestUser()
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: patchUser.id,
          slug: `community-patch-lt-${random}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: patchUser.id,
          role: 'owner',
        })

        const request = createRequest()
        await request.authenticateAs(patchUser)

        const response = await request
          .patch(`/api/v1/communities/${community.slug}`)
          .set('Content-Type', 'application/json')
          .send({ list_type: 'follow' })
          .expect(200)

        expect(response.body.community.list_type).toBe('follow')
      })

      it('clears list_type when set to null', async () => {
        const patchUser = await createTestUser()
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: patchUser.id,
          slug: `community-patch-lt-null-${random}`,
          list_type: 'mute',
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: patchUser.id,
          role: 'owner',
        })

        const request = createRequest()
        await request.authenticateAs(patchUser)

        const response = await request
          .patch(`/api/v1/communities/${community.slug}`)
          .set('Content-Type', 'application/json')
          .send({ list_type: null })
          .expect(200)

        expect(response.body.community.list_type).toBeNull()
      })

      it('returns 422 for invalid list_type', async () => {
        const patchUser = await createTestUser()
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: patchUser.id,
          slug: `community-patch-lt-inv-${random}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: patchUser.id,
          role: 'owner',
        })

        const request = createRequest()
        await request.authenticateAs(patchUser)

        await request
          .patch(`/api/v1/communities/${community.slug}`)
          .set('Content-Type', 'application/json')
          .send({ list_type: 'invalid' })
          .expect(422)
      })
    })

    describe('DELETE /api/v1/communities/:slug', () => {
      it('returns 401 without auth', async () => {
        const deleteUser = await createTestUser()
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: deleteUser.id,
          slug: `community-delete-401-${random}`,
        })

        const request = createRequest()
        await request.delete(`/api/v1/communities/${community.slug}`).expect(401)
      })

      it('returns 403 as non-owner', async () => {
        const [owner, other] = await Promise.all([createTestUser(), createTestUser()])
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: owner!.id,
          slug: `community-delete-403-${random}`,
        })

        const request = createRequest()
        await request.authenticateAs(other!)

        await request.delete(`/api/v1/communities/${community.slug}`).expect(403)
      })

      it('deletes and returns 204 as owner', async () => {
        const deleteOwner = await createTestUser()
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: deleteOwner.id,
          slug: `community-delete-ok-${random}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: deleteOwner.id,
          role: 'owner',
        })

        const request = createRequest()
        await request.authenticateAs(deleteOwner)

        await request.delete(`/api/v1/communities/${community.slug}`).expect(204)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createTestPost)
  void (0 as unknown as typeof insertTestCommunityListItem)
  void (0 as unknown as typeof insertTestRssFeedItem)
  void (0 as unknown as typeof insertTestUrl)
  void (0 as unknown as typeof insertTestUrlHostname)
  void (0 as unknown as typeof createTestRssFeedWithTiming)
  void (0 as unknown as typeof createTestRssFeedItemWithUrl)
  void (0 as unknown as typeof createTestTopic)
  void (0 as unknown as typeof createEntityRelationWithElection)
  void (0 as unknown as typeof createHash)
  void (0 as unknown as typeof user)
})
