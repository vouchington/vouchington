import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestPost } from '../../../test-helpers/entities/create-test-entities.mts'
import { insertTestStory } from '../../../test-helpers/entities/stories.mts'
import { createTestUrlWithHostname } from '../../../test-helpers/entities/urls.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { beginTransaction, onGracefulShutdown, type QueryExecutor } from '../index.mts'

const FENCE_FKEY = 'story_post_url_projection_mutations_relation_fkey'

async function createFixture() {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const otherPost = await createTestPost({ user })
  const story = await insertTestStory()
  const urlId = await createTestUrlWithHostname()
  return { userId: user.id, postId: post.id, otherPostId: otherPost.id, storyId: story.id, urlId }
}

async function insertJob(query: QueryExecutor, postId: string, storyId: string) {
  await query(
    `/* insertProjectionFenceJob */
    INSERT INTO story_post_related_url_projection_jobs (post_id, story_id) VALUES ($1, $2)`,
    [postId, storyId],
  )
}

async function insertRelation(query: QueryExecutor, postId: string, urlId: string, userId: string) {
  const { rows } = await query<{ id: string }>(
    `/* insertProjectionFenceRelation */
    INSERT INTO relation__post__related__url (subject_id, object_id, created_by_id)
    VALUES ($1, $2, $3) RETURNING id`,
    [postId, urlId, userId],
  )
  return rows[0]!.id
}

async function insertFence(query: QueryExecutor, postId: string, relationId: string) {
  await query(
    `/* insertProjectionFence */
    INSERT INTO story_post_related_url_projection_relation_mutations
      (post_id, generation, relation_id) VALUES ($1, 1, $2)`,
    [postId, relationId],
  )
}

async function readFenceRelationIds(query: QueryExecutor, postId: string) {
  const { rows } = await query<{ relation_id: string }>(
    `/* readProjectionFenceRelationIds */
    SELECT relation_id FROM story_post_related_url_projection_relation_mutations
    WHERE post_id = $1`,
    [postId],
  )
  return rows.map(row => row.relation_id)
}

describe('story post related URL projection relation fence', () => {
  afterAll(onGracefulShutdown)

  it('rejects a fence for a relation that does not exist', async () => {
    const fixture = await createFixture()
    await using query = await beginTransaction()
    await insertJob(query, fixture.postId, fixture.storyId)

    await expect(insertFence(query, fixture.postId, randomUUID())).rejects.toMatchObject({
      code: '23503',
      constraint: FENCE_FKEY,
    })
  })

  it('rejects a fence for a relation owned by a different post', async () => {
    const fixture = await createFixture()
    await using query = await beginTransaction()
    await insertJob(query, fixture.postId, fixture.storyId)
    const otherRelationId = await insertRelation(
      query,
      fixture.otherPostId,
      fixture.urlId,
      fixture.userId,
    )

    await expect(insertFence(query, fixture.postId, otherRelationId)).rejects.toMatchObject({
      code: '23503',
      constraint: FENCE_FKEY,
    })
  })

  it('records the fence for an active relation and cascades it when the relation is deleted', async () => {
    const fixture = await createFixture()
    await using query = await beginTransaction()
    await insertJob(query, fixture.postId, fixture.storyId)
    const relationId = await insertRelation(query, fixture.postId, fixture.urlId, fixture.userId)
    expect(await readFenceRelationIds(query, fixture.postId)).toEqual([relationId])

    await query(
      '/* deleteProjectionFenceRelation */ DELETE FROM relation__post__related__url WHERE id = $1',
      [relationId],
    )

    expect(await readFenceRelationIds(query, fixture.postId)).toEqual([])
  })
})
