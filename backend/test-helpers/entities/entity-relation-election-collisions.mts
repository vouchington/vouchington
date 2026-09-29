import type { PrivateUser } from '@voucha/types/entities/user'
import { createTestPost, createTestTopic } from './create-test-entities.mts'
import { insertTestEntityRelationVote } from './entity-relation-votes.mts'
import {
  getEntityRelation,
  insertEntityRelation,
  setTestEntityRelationIdAndScore,
} from './entity-relations.mts'
import { createTestUser } from './users.mts'

export type SameIdElectionRelation = {
  relationTable: 'relation__post__category__topic' | 'relation__topic__related__post'
  subjectId: string
  objectId: string
  votesScoreUp: number
}

export type SameIdElectionRelationFixture = {
  /** The one UUID that both election relation rows use. */
  id: string
  /** A topic/related/post relation whose UUID exists in no other relation table. */
  uniqueTopicRelatedId: string
  viewer: PrivateUser
  postCategory: SameIdElectionRelation
  topicRelated: SameIdElectionRelation
}

async function insertRelationAndReadId(
  relationTable: SameIdElectionRelation['relationTable'],
  subjectId: string,
  objectId: string,
): Promise<string> {
  await insertEntityRelation(relationTable, subjectId, objectId)
  const [row] = (await getEntityRelation(relationTable, subjectId, objectId)) as Array<{
    id: string
  }>
  return row!.id
}

/**
 * Creates one post/category/topic relation and one topic/related/post relation that share a UUID
 * but carry different election scores and different viewer votes. The two tables are distinct
 * election families, so a bare-UUID election lookup is ambiguous between them. A third relation in
 * the topic/related/post table has a UUID that is not shared.
 */
export async function createSameIdElectionRelations(scores: {
  postCategory: number
  topicRelated: number
  viewerVotes: { postCategory: 1 | -1; topicRelated: 1 | -1 }
}): Promise<SameIdElectionRelationFixture> {
  const viewer = await createTestUser()
  const post = await createTestPost({ user: viewer })
  const otherPost = await createTestPost({ user: viewer })
  const topic = await createTestTopic({ user: viewer })
  const postCategory = {
    relationTable: 'relation__post__category__topic',
    subjectId: post.id,
    objectId: topic.id,
    votesScoreUp: scores.postCategory,
  } as const
  const topicRelated = {
    relationTable: 'relation__topic__related__post',
    subjectId: topic.id,
    objectId: post.id,
    votesScoreUp: scores.topicRelated,
  } as const
  const id = await insertRelationAndReadId(postCategory.relationTable, post.id, topic.id)
  await insertEntityRelation(topicRelated.relationTable, topic.id, post.id)
  const uniqueTopicRelatedId = await insertRelationAndReadId(
    topicRelated.relationTable,
    topic.id,
    otherPost.id,
  )
  await setTestEntityRelationIdAndScore(
    topicRelated.relationTable,
    topic.id,
    post.id,
    id,
    topicRelated.votesScoreUp,
  )
  await setTestEntityRelationIdAndScore(
    postCategory.relationTable,
    post.id,
    topic.id,
    id,
    postCategory.votesScoreUp,
  )
  await insertTestEntityRelationVote({
    relationTable: postCategory.relationTable,
    relationId: id,
    subjectId: post.id,
    userId: viewer.id,
    score: scores.viewerVotes.postCategory,
  })
  await insertTestEntityRelationVote({
    relationTable: topicRelated.relationTable,
    relationId: id,
    subjectId: topic.id,
    userId: viewer.id,
    score: scores.viewerVotes.topicRelated,
  })
  return { id, uniqueTopicRelatedId, viewer, postCategory, topicRelated }
}

/** Rewrites one family's stored score without touching any cache, so cache reads can be compared. */
export async function setSameIdElectionScore(
  fixture: SameIdElectionRelationFixture,
  family: 'postCategory' | 'topicRelated',
  votesScoreUp: number,
): Promise<void> {
  const relation = fixture[family]
  await setTestEntityRelationIdAndScore(
    relation.relationTable,
    relation.subjectId,
    relation.objectId,
    fixture.id,
    votesScoreUp,
  )
}
