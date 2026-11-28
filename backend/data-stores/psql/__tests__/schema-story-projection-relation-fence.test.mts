import { randomUUID } from 'node:crypto'
import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  insertProjectionFenceForMissingRelation,
  insertProjectionFenceForOtherPostRelation,
  recordAndCascadeProjectionFence,
} from '../../../test-helpers/data-stores/psql/schema-story-projection-relation-fence.mts'
import { createTestPost } from '../../../test-helpers/entities/create-test-entities.mts'
import { insertTestStory } from '../../../test-helpers/entities/stories.mts'
import { createTestUrlWithHostname } from '../../../test-helpers/entities/urls.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'

const FENCE_FKEY = 'story_post_url_projection_mutations_relation_fkey'

async function createFixture() {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const otherPost = await createTestPost({ user })
  const story = await insertTestStory()
  const urlId = await createTestUrlWithHostname()
  return { userId: user.id, postId: post.id, otherPostId: otherPost.id, storyId: story.id, urlId }
}

describe('story post related URL projection relation fence', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it('rejects a fence for a relation that does not exist', async () => {
    const fixture = await createFixture()

    await expect(
      insertProjectionFenceForMissingRelation({
        postId: fixture.postId,
        storyId: fixture.storyId,
        missingRelationId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: FENCE_FKEY,
    })
  })

  it('rejects a fence for a relation owned by a different post', async () => {
    const fixture = await createFixture()

    await expect(insertProjectionFenceForOtherPostRelation(fixture)).rejects.toMatchObject({
      code: '23503',
      constraint: FENCE_FKEY,
    })
  })

  it('records the fence for an active relation and cascades it when the relation is deleted', async () => {
    const fixture = await createFixture()
    const { relationId, beforeDeleteIds, afterDeleteIds } =
      await recordAndCascadeProjectionFence(fixture)

    expect(beforeDeleteIds).toEqual([relationId])
    expect(afterDeleteIds).toEqual([])
  })
})
