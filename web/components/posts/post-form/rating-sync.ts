import { addPostRating, deletePostRating, updatePostRating } from '@/lib/api/client/posts'
import type { Post } from '@/types/posts'
import type { ReviewTopicEntry } from '../post-form-sections'

type RatingAction = () => Promise<unknown>

export async function syncReviewRatings(
  saved: Post,
  post: Post,
  reviewTopics: ReviewTopicEntry[],
): Promise<void> {
  const originalRatings = post.review_topic_ratings ?? []
  const originalByTopicId = new Map(originalRatings.map(r => [r.topic_id, r]))
  const currentTopicIds = new Set(reviewTopics.map(t => t.topicId))
  const addFns = reviewTopics.flatMap((t, i) =>
    !originalByTopicId.has(t.topicId)
      ? [() => addPostRating(saved.id, { topic_id: t.topicId, rating: t.rating, order_index: i })]
      : [],
  )
  const updateFns = reviewTopics.flatMap((t, i) =>
    buildRatingUpdate(saved, originalByTopicId.get(t.topicId), t, i),
  )
  const deleteFns = originalRatings.flatMap(r =>
    !currentTopicIds.has(r.topic_id) ? [() => deletePostRating(saved.id, r.topic_id)] : [],
  )
  const noop: Promise<unknown> = Promise.resolve()
  const allOriginalRatingsRemoved = deleteFns.length === originalRatings.length
  const [preservedDeleteFn, ...initialDeleteFns] = allOriginalRatingsRemoved ? deleteFns : []
  const [firstAddFn, ...remainingAddFns] = addFns
  if (allOriginalRatingsRemoved && preservedDeleteFn && firstAddFn) {
    // ast-grep-ignore: no-three-sequential-awaits -- UI helper intentionally serializes dependent client mutations
    await initialDeleteFns.reduce((chain, fn) => chain.then(fn), noop)
    await firstAddFn()
    await preservedDeleteFn()
    await [...remainingAddFns, ...updateFns].reduce((chain, fn) => chain.then(fn), noop)
    return
  }
  await deleteFns.reduce((chain, fn) => chain.then(fn), noop)
  await [...addFns, ...updateFns].reduce((chain, fn) => chain.then(fn), noop)
}

function buildRatingUpdate(
  saved: Post,
  orig: { order_index: number; rating: number } | undefined,
  topic: ReviewTopicEntry,
  orderIndex: number,
): RatingAction[] {
  if (!orig) return []
  const ratingChanged = orig.rating !== topic.rating
  const orderChanged = orig.order_index !== orderIndex
  if (!ratingChanged && !orderChanged) return []
  return [
    () =>
      updatePostRating(saved.id, topic.topicId, {
        ...(ratingChanged && { rating: topic.rating }),
        ...(orderChanged && { order_index: orderIndex }),
      }),
  ]
}
