import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestPost,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('list-items-posts', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let community: Community

  beforeAll(async () => {
    const [ownerUser, memberUser] = await Promise.all([createTestUser(), createTestUser()])
    owner = ownerUser!
    member = memberUser!
    community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
    ])
  })

  describe('POST /api/v1/communities/:slug/list-items/posts', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const postId = await insertTestPost({
        title: `Post 401 ${random}`,
        slug: `post-401-${random}`,
        createdById: owner.id,
        markdown: 'Body',
      })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/list-items/posts`)
        .set('Content-Type', 'application/json')
        .send({ post_id: postId })
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const postId = await insertTestPost({
        title: `Post 403 ${random}`,
        slug: `post-403-${random}`,
        createdById: owner.id,
        markdown: 'Body',
      })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/posts`)
        .set('Content-Type', 'application/json')
        .send({ post_id: postId })
        .expect(403)
    })

    it('returns 201 and creates item as owner', async () => {
      const random = createRandomString(8)
      const postId = await insertTestPost({
        title: `Post 201 ${random}`,
        slug: `post-201-${random}`,
        createdById: owner.id,
        markdown: 'Body',
      })

      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/posts`)
        .set('Content-Type', 'application/json')
        .send({ post_id: postId })
        .expect(201)

      expect(response.body.community_list_item).toBeDefined()
      expect(response.body.community_list_item.entity_id).toBe(postId)
      expect(response.body.community_list_item.item_type).toBe('post')
    })

    it('returns 201 as moderator', async () => {
      const random = createRandomString(8)
      const moderator = await createTestUser()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const postId = await insertTestPost({
        title: `Mod Post ${random}`,
        slug: `mod-post-${random}`,
        createdById: owner.id,
        markdown: 'Body',
      })

      const request = createRequest()
      await request.authenticateAs(moderator)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/posts`)
        .set('Content-Type', 'application/json')
        .send({ post_id: postId })
        .expect(201)

      expect(response.body.community_list_item.entity_id).toBe(postId)
    })

    it('returns 422 when post_id is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/posts`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(422)
    })
  })

  describe('DELETE /api/v1/communities/:slug/list-items/posts/:itemId', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const postId = await insertTestPost({
        title: `Delete 401 ${random}`,
        slug: `delete-401-${random}`,
        createdById: owner.id,
        markdown: 'Body',
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'post',
        entityId: postId,
      })

      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/posts/${item.id}`)
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const postId = await insertTestPost({
        title: `Delete 403 ${random}`,
        slug: `delete-403-${random}`,
        createdById: owner.id,
        markdown: 'Body',
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'post',
        entityId: postId,
      })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/posts/${item.id}`)
        .expect(403)
    })

    it('returns 204 as owner', async () => {
      const random = createRandomString(8)
      const postId = await insertTestPost({
        title: `Delete 204 ${random}`,
        slug: `delete-204-${random}`,
        createdById: owner.id,
        markdown: 'Body',
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'post',
        entityId: postId,
      })

      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/posts/${item.id}`)
        .expect(204)
    })
  })
})
