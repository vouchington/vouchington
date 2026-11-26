import assert from 'node:assert/strict'
import { paginationMaxima } from '@services/pagination/config'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const excludedPostIndices = new Set([3, 5, 10])
const seededPostTypes = ['discussion', 'review', 'data_point'] as const

export async function runFeedPostHydrationCapacityScenario(): Promise<void> {
  const limit = paginationMaxima.max_limit
  // Skip the recommendation and the two community posts. The remaining recent posts share
  // one monthly leaf, have two seeded images each, and include all three general-feed types.
  const seedIndices = Array.from(
    { length: limit + excludedPostIndices.size },
    (_, index) => index,
  ).filter(index => !excludedPostIndices.has(index))
  const pageIndices = [
    ...seedIndices.filter((_, position) => position % 2 === 0),
    ...seedIndices.filter((_, position) => position % 2 === 1).toReversed(),
  ]
  const ids = pageIndices.map(index => seedUuid(index, '05'))
  assert.equal(new Set(ids).size, limit)

  await runAndCapture(
    'feed-posts-batch-at-cap',
    async () => {
      const posts = await getPostsByAnyBatch(ids)
      assert.deepEqual(
        posts.map(post =>
          post
            ? {
                id: post.id,
                title: post.title,
                postType: post.post_type,
                creatorId: post.created_by?.id,
                imageIds: post.images?.map(image => image.image_id),
              }
            : null,
        ),
        pageIndices.map(index => ({
          id: seedUuid(index, '05'),
          title: `Seed Post ${index}`,
          postType: seededPostTypes[index % seededPostTypes.length],
          creatorId: seedUuid(index, '01'),
          imageIds: [seedUuid(2 * index, 'd1'), seedUuid(2 * index + 1, 'd1')],
        })),
      )

      const discussion = posts.find(post => post?.id === seedUuid(0, '05'))
      assert.equal(
        discussion?.post_hashtags?.find(hashtag => hashtag.key === 'seed-alias-2499')
          ?.display_token,
        'HydrationFixture',
      )
      const review = posts.find(post => post?.id === seedUuid(1, '05'))
      assert.equal(
        review?.review_topic_ratings?.find(rating => rating.topic_id === seedUuid(0, '04'))?.rating,
        1,
      )
    },
    undefined,
    'getPostsByAnyBatch',
    { exactCapturedNames: ['getPostsByAnyBatch'] },
  )
}
