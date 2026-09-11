import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  getTestPostPublicationDirtyWorkForScope,
  getTopicAliasIdForTest,
  insertEntityRelation,
  insertTestEntityRelationVote,
  insertTestUrlDirect,
  insertTopicAliasForTest,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactTopicIds,
  setTestEntityRelationIdAndScore,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { deleteUserAndDrainForTest } from '../delete-test-support.mts'

const cleanupDeps = {
  deleteExportsFromS3: async () => undefined,
  sanitizeStripeCustomer: async () => undefined,
}

describe('deleteUser entity-relation vote publication capture', () => {
  it.each(['topic', 'topic_alias', 'related_url'] as const)(
    'captures a %s relation leaving public eligibility when its voter is deleted',
    async relationKind => {
      const voter = await createTestUser()
      const author = await createTestUser()
      const post = await createTestPost({ user: author })
      const fixture = await createPublicationRelation(relationKind, voter.id, post.id)
      await setTestEntityRelationIdAndScore(
        fixture.relationTable,
        post.id,
        fixture.objectId,
        fixture.relationId,
        1,
      )
      await insertTestEntityRelationVote({
        relationTable: fixture.relationTable,
        relationId: fixture.relationId,
        subjectId: post.id,
        userId: voter.id,
        score: 1,
      })
      await expect(
        getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id }),
      ).resolves.toBeUndefined()

      await deleteUserAndDrainForTest(voter, voter, cleanupDeps)

      const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
      expect(exited).toBeDefined()
      await expect(listTestPostPublicationImpactTopicIds(exited!.id)).resolves.toEqual(
        fixture.impactedTopicIds,
      )
      await expect(listTestPostPublicationImpactPostIds(exited!.id)).resolves.toEqual(
        fixture.impactedPostIds,
      )
    },
  )
})

async function createPublicationRelation(
  relationKind: 'topic' | 'topic_alias' | 'related_url',
  voterId: string,
  postId: string,
) {
  const topic = relationKind === 'related_url' ? undefined : await createTestTopic()
  let objectId: string
  if (relationKind === 'topic') {
    objectId = topic!.id
  } else if (relationKind === 'topic_alias') {
    const alias = `deletion-publication-${randomUUID()}`
    await insertTopicAliasForTest(topic!.id, alias)
    objectId = (await getTopicAliasIdForTest(alias))!
  } else {
    const url = await insertTestUrlDirect(
      voterId,
      `https://deletion-publication-${randomUUID().slice(0, 8)}.example.com`,
    )
    if (!url) throw new Error('Expected test URL')
    objectId = url.id
  }
  const metadata = getEntityRelationMetadataOrThrow(
    relationKind === 'topic'
      ? { subjectType: 'post', objectType: 'topic', predicate: 'category' }
      : relationKind === 'topic_alias'
        ? { subjectType: 'post', objectType: 'topic_alias', predicate: 'category' }
        : { subjectType: 'post', objectType: 'url', predicate: 'related' },
  )
  await insertEntityRelation(metadata.table_name, postId, objectId)
  const [relation] = (await getEntityRelation(metadata.table_name, postId, objectId)) as Array<{
    id: string
  }>
  return {
    metadata,
    objectId,
    relationId: relation!.id,
    relationTable: metadata.table_name,
    impactedTopicIds: topic ? [topic.id] : [],
    impactedPostIds: relationKind === 'related_url' ? [postId] : [],
  }
}
