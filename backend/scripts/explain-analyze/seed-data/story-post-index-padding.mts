import { beginTransaction } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

const PADDING_COUNT = 600
const PADDING_POST_INDEX_START = 800_000
const DAYS_BEFORE_WINDOW = 40

/**
 * story_posts is otherwise small enough that a nested seq scan beats its primary key.
 * These rows sit outside the 30-day search window. They are removed before later scenarios.
 */
export async function seedStoryPostIndexPadding(initiatedById: string): Promise<void> {
  const { postIds, storyIds } = paddingIds()
  await using transaction = await beginTransaction()
  const query = transaction
  await query(
    `/* seedStoryPostIndexPadding:stories */ INSERT INTO stories (id, title)
     SELECT id, 'Story post index padding' FROM UNNEST($1::uuid[]) AS seed(id)`,
    [storyIds],
  )
  await query(
    `/* seedStoryPostIndexPadding:posts */ INSERT INTO posts (
       id, created_via, post_type, title, created_by_id, approved_at,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     SELECT id, 'system', 'story', 'Story post index padding', $2, CURRENT_TIMESTAMP,
       decode(repeat('ab', 32), 'hex'), decode(repeat('ab', 32), 'hex')
     FROM UNNEST($1::uuid[]) AS seed(id)`,
    [postIds, initiatedById],
  )
  await query(
    `/* seedStoryPostIndexPadding:links */ INSERT INTO story_posts (post_id, story_id, initiated_by_id)
     SELECT post_id, story_id, $3
     FROM UNNEST($1::uuid[], $2::uuid[]) AS seed(post_id, story_id)`,
    [postIds, storyIds, initiatedById],
  )
  await transaction.commit()
}

export async function deleteStoryPostIndexPadding(): Promise<void> {
  const { postIds, storyIds } = paddingIds()
  await using transaction = await beginTransaction()
  const query = transaction
  await query(
    `/* deleteStoryPostIndexPadding:posts */ DELETE FROM posts WHERE id = ANY($1::uuid[])`,
    [postIds],
  )
  await query(
    `/* deleteStoryPostIndexPadding:stories */ DELETE FROM stories WHERE id = ANY($1::uuid[])`,
    [storyIds],
  )
  await transaction.commit()
}

function paddingIds(): { postIds: string[]; storyIds: string[] } {
  const postMs = postSeedTimestampMs(0) - DAYS_BEFORE_WINDOW * 24 * 60 * 60 * 1000
  const postIds: string[] = []
  const storyIds: string[] = []
  for (let index = 0; index < PADDING_COUNT; index += 1) {
    postIds.push(seedUuidAtTimestamp(postMs, PADDING_POST_INDEX_START + index))
    storyIds.push(seedUuid(index, 'bd'))
  }
  return { postIds, storyIds }
}
