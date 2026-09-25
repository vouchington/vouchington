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
import { getEntityRelations } from '@services/entity-relations/query'
import { deleteUserAndDrainForTest } from '@services/users/delete-test-support'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'

describe('user deletion entity-relation vote repair', () => {
  it('keeps same-id relations in different tables isolated', async () => {
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
    await setTestEntityRelationIdAndScore(
      postMetadata.table_name,
      postId,
      tag!.id,
      userRelation!.id!,
      1,
    )
    await setTestEntityRelationIdAndScore(
      userMetadata.table_name,
      target.id,
      tag!.id,
      userRelation!.id!,
      1,
    )
    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: userRelation!.id!, score: 1 }],
      undefined,
      userMetadata,
      { enqueueVoteStats: false },
    )
    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: userRelation!.id!, score: 1 }],
      undefined,
      postMetadata,
      { enqueueVoteStats: false },
    )

    await deleteUserAndDrainForTest(voter, voter)

    await expect(
      getEntityRelations('user', target.id, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: userRelation!.id, votes_score_net: 0 })])
    await expect(
      getEntityRelations('post', postId, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: userRelation!.id, votes_score_net: 0 })])
  })
})
