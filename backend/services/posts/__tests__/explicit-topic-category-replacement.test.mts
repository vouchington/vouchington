import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestTopic,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createPost } from '../create.mts'
import { getRetainedPostCategories } from '../hashtag-retained-categories.mts'
import { updatePost } from '../update.mts'

describe('explicit topic category replacement', () => {
  it('replaces a full ceiling of explicit topic categories with the new set', async () => {
    const creator = await createTestUser({ administrator: true })
    const suffix = createRandomString(8).toLowerCase()
    const topicIds = await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        insertTestTopic({
          name: `Replace category ${suffix} ${index}`,
          slug: `replace-category-${suffix}-${index}`,
          createdById: creator.id,
        }),
      ),
    )
    const [replacementId, ...fullSet] = topicIds.toReversed()
    const post = await createPost(creator, WEB_PROVENANCE, {
      title: `Full explicit category set ${suffix}`,
      categories: fullSet.map(topic_id => ({ type: 'topic' as const, topic_id })),
    })
    expect(await getRetainedPostCategories(post!.id)).toHaveLength(20)

    await updatePost(creator, post!, {
      categories: [{ type: 'topic', topic_id: replacementId! }],
    })

    expect(await getRetainedPostCategories(post!.id)).toEqual([
      { type: 'topic', topic_id: replacementId },
    ])
  })
})
