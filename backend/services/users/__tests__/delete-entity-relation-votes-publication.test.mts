import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  getTopicAliasIdForTest,
  insertEntityRelation,
  insertTestEntityRelationVote,
  insertTestUrlDirect,
  insertTopicAliasForTest,
  setTestEntityRelationIdAndScore,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'

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
      const jobs = await captureAddedPublicationEffectsForScope(post.id, () =>
        deleteUserAndDrainForTest(voter, voter, cleanupDeps),
      )
      expect(jobs.length).toBeGreaterThan(0)
      const keys = jobs.flatMap(job => job.keys)
      for (const topicId of fixture.impactedTopicIds)
        expect(keys).toContainEqual({ kind: 'impact_topic', uuidValue: topicId })
      for (const postId of fixture.impactedPostIds)
        expect(keys).toContainEqual({ kind: 'impact_post', uuidValue: postId })
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
