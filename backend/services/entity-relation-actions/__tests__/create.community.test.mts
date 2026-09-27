import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createEntityRelationAction } from '../create.mts'

function topicFixture(createdById: string) {
  const id = crypto.randomUUID()
  return {
    createdById,
    name: `Community mute topic ${id}`,
    slug: `community-mute-topic-${id}`,
  }
}

describe('createEntityRelationAction community relations', () => {
  it('allows a community owner and moderator to add community relations', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const moderator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])
    const [ownerTopicId, moderatorTopicId] = await Promise.all([
      insertTestTopic(topicFixture(owner.id)),
      insertTestTopic(topicFixture(moderator.id)),
    ])

    await expect(
      createEntityRelationAction(
        owner,
        { kind: 'first_party' },
        {
          entityType: 'community',
          entityId: community.id,
          predicate: 'mute',
          objectType: 'topic',
          objectId: ownerTopicId,
        },
      ),
    ).resolves.toMatchObject({ relation: { object_id: ownerTopicId } })
    await expect(
      createEntityRelationAction(
        moderator,
        { kind: 'first_party' },
        {
          entityType: 'community',
          entityId: community.id,
          predicate: 'mute',
          objectType: 'topic',
          objectId: moderatorTopicId,
        },
      ),
    ).resolves.toMatchObject({ relation: { object_id: moderatorTopicId } })
  })

  it('rejects non-members and missing communities before a relation is written', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const nonMember = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const community = await insertTestCommunity({ createdById: owner.id })
    const topicId = await insertTestTopic(topicFixture(owner.id))
    const input = {
      entityType: 'community',
      predicate: 'mute',
      objectType: 'topic',
      objectId: topicId,
    }

    await expect(
      createEntityRelationAction(
        nonMember,
        { kind: 'first_party' },
        {
          ...input,
          entityId: community.id,
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(
      createEntityRelationAction(
        nonMember,
        { kind: 'first_party' },
        {
          ...input,
          entityId: crypto.randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      getEntityRelation('relation__community__mute__topic', community.id, topicId),
    ).resolves.toEqual([])
  })
})
