import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  insertTestPost,
  setTestEntityRelationIdAndScore,
} from '@voucha/test-helpers'
import { getUserTagTopics } from '@services/topics/user-tag-topics'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { getEntityRelationElectionByTargetCachedBatch } from '@services/entity-fetch/get'
import { getEntityRelations } from '@services/entity-relations/query'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'

// A user/category/topic relation and a post/category/topic relation that share one UUID, both
// starting at votes_score_up = 1. `voteIn` picks which of them the deleted voter has voted on.
async function createSameIdUserAndPostRelations(voteIn: Array<'user' | 'post'>) {
  const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  const target = await createTestUser()
  const [tag] = await getUserTagTopics()
  const postId = await insertTestPost({
    title: `Collision ${randomUUID()}`,
    slug: `collision-${randomUUID()}`,
    createdById: voter.id,
    markdown: 'Collision regression',
  })
  const userMetadata = getEntityRelationMetadataOrThrow({
    subjectType: 'user',
    predicate: 'category',
    objectType: 'topic',
  })
  const postMetadata = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    predicate: 'category',
    objectType: 'topic',
  })
  const [userRelation] = await upsertEntityRelation(voter, userMetadata, target, [tag!], {
    vote: false,
  })
  await upsertEntityRelation(voter, postMetadata, { id: postId }, [tag!], { vote: false })
  const id = userRelation!.id!
  await setTestEntityRelationIdAndScore(postMetadata.table_name, postId, tag!.id, id, 1)
  await setTestEntityRelationIdAndScore(userMetadata.table_name, target.id, tag!.id, id, 1)
  for (const [family, metadata] of [
    ['user', userMetadata],
    ['post', postMetadata],
  ] as const) {
    if (!voteIn.includes(family)) continue
    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: id, score: 1 }],
      undefined,
      metadata,
      {
        enqueueVoteStats: false,
      },
    )
  }
  return { voter, target, tag: tag!, postId, id, userMetadata, postMetadata }
}

describe('user deletion entity-relation vote repair', () => {
  it('keeps same-id relations in different tables isolated', async () => {
    const { voter, target, postId, id } = await createSameIdUserAndPostRelations(['user', 'post'])

    await deleteUserAndDrainForTest(voter, voter)

    await expect(
      getEntityRelations('user', target.id, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toEqual([expect.objectContaining({ id, votes_score_net: 0 })])
    await expect(
      getEntityRelations('post', postId, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toEqual([expect.objectContaining({ id, votes_score_net: 0 })])
  })

  it('invalidates the cached election only in the repaired relation table', async () => {
    const { voter, target, tag, postId, id, userMetadata, postMetadata } =
      await createSameIdUserAndPostRelations(['user'])
    const userTarget = createEntityRelationElectionTarget(id, userMetadata.table_name)
    const postTarget = createEntityRelationElectionTarget(id, postMetadata.table_name)
    await getEntityRelationElectionByTargetCachedBatch([userTarget, postTarget])
    // Move the stored post-table score behind the cache. A deletion that invalidated the bare UUID
    // would evict this entry too and read the new score.
    await setTestEntityRelationIdAndScore(postMetadata.table_name, postId, tag.id, id, 4)

    await deleteUserAndDrainForTest(voter, voter)

    const [userElection, postElection] = await getEntityRelationElectionByTargetCachedBatch([
      userTarget,
      postTarget,
    ])
    expect(userElection?.votes_score_net).toBe(0)
    expect(postElection?.votes_score_net).toBe(1)
    await expect(
      getEntityRelations('user', target.id, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toEqual([expect.objectContaining({ id, votes_score_net: 0 })])
  })
})
