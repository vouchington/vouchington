import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  createTestPost,
  createTestTopic,
  getEntityRelation,
} from '@voucha/test-helpers'
import { withHeldRelationReadContextForTest } from '@voucha/test-helpers/relation-read-context'
import { createEntityRelationAction } from '../create.mts'
import { upsertBookmarkAction } from '../bookmark.mts'

const authority = {
  kind: 'delegated',
  grantedScopes: ['entity-relations:read', 'entity-relations:write'],
} as const

describe('relation and bookmark authorization context', () => {
  it('creates a symmetric post relation while both participant publication contexts are held', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const first = await createTestPost({ user: owner })
    const second = await createTestPost({ user: owner })
    await withHeldRelationReadContextForTest({ postIds: [first.id, second.id] }, async () => {
      await createEntityRelationAction(
        owner,
        { ...authority, credentialOwnerId: owner.id },
        {
          entityType: 'post',
          entityId: first.id,
          predicate: 'related',
          objectType: 'post',
          objectId: second.id,
        },
      )
      expect(
        await getEntityRelation('relation__post__related__post', first.id, second.id),
      ).toHaveLength(1)
      expect(
        await getEntityRelation('relation__post__related__post', second.id, first.id),
      ).toHaveLength(1)
    })
  })

  it('creates an FAQ relation and delegated bookmark while post and root contexts are held', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const root = await createTestPost({ user: owner })
    const reply = await createTestPost({
      user: owner,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    const topic = await createTestTopic({ user: owner })
    await withHeldRelationReadContextForTest({ postIds: [reply.id, root.id] }, async () => {
      await createEntityRelationAction(
        owner,
        { ...authority, credentialOwnerId: owner.id },
        {
          entityType: 'topic',
          entityId: topic.id,
          predicate: 'faq',
          objectType: 'post',
          objectId: reply.id,
        },
      )
      expect(
        await getEntityRelation('relation__topic__faq__post', topic.id, reply.id),
      ).toHaveLength(1)
      await upsertBookmarkAction(
        owner,
        { ...authority, credentialOwnerId: owner.id },
        {
          entityType: 'post',
          entityId: reply.id,
          predicate: 'save',
        },
      )
      expect(
        await getEntityRelation('relation__user__save__post', owner.id, reply.id),
      ).toHaveLength(1)
    })
  })
})
