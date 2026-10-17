import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertEntityRelation,
  insertTestPost,
  markTestPostDeletedBy,
} from '@voucha/test-helpers'
import { getPrivateCounts } from './metrics-private-counts.mts'

describe('getPrivateCounts', () => {
  it('counts only live saved posts through the keyed target lookup', async () => {
    const owner = await createTestUser()
    const postId = await insertTestPost({
      createdById: owner.id,
      postType: 'discussion',
      title: 'Private count target',
      slug: `private-count-${owner.id}`,
      markdown: 'A post saved by its owner for the private count query.',
    })
    await insertEntityRelation('relation__user__save__post', owner.id, postId)

    expect((await getPrivateCounts(owner.id, {})).posts_saved).toBe(1)

    await markTestPostDeletedBy(postId, owner.id)
    expect((await getPrivateCounts(owner.id, {})).posts_saved).toBe(0)
  })
})
