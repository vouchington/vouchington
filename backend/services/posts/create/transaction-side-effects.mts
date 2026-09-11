import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'
import type { CommunityPostReview } from '@services/communities/types'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createPostSlug } from '../slugs.mts'
import {
  assertReviewTopicsAllowReviews,
  assertValidReviewTopicRatings,
} from '../validate-review-topic-ratings.mts'
import { insertPostDataPointTopics } from '../data-point-topics.mts'
import { createCommunityPostReview } from '@services/communities/publications/add'
import { createPostRevision, computePostChanges } from '@services/post-revisions'
import { syncPostHashtagCategoriesInTransaction } from '../hashtags.mts'
import { syncPostExplicitTopicCategoriesInTransaction } from '../explicit-topic-categories.mts'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  persistPostCategoryFinalization,
  type PostCategoryFinalization,
} from '../post-category-finalizations.mts'

export async function applyPostTransactionSideEffects({
  creator,
  options,
  post,
  postType,
  updates,
}: {
  creator: PrivateUser
  options: QueryOptions
  post: { id: string; community_id?: string | null; title: string | null }
  postType: NonNullable<CreatePostInput['post_type']>
  updates: CreatePostInput
}): Promise<{
  communityReviews: CommunityPostReview[]
  postCategoryFinalization: PostCategoryFinalization
}> {
  await Promise.all([
    syncPostHashtagCategoriesInTransaction(creator, post.id, updates, options),
    syncPostExplicitTopicCategoriesInTransaction(post.id, updates.categories, options),
  ])
  const communityReview =
    postType !== 'comment' && post.community_id
      ? createCommunityPostReview(creator.id, post.id, post.community_id, options, 'unfinalized')
      : Promise.resolve(null)
  const changes = computePostChanges(null, post)
  const [, , , , , review] = await Promise.all([
    insertReviewRatings({ options, postId: post.id, postType, updates }),
    insertDataPointTopics({ options, postId: post.id, postType, updates }),
    insertDataPointTopicRelations({ creator, options, post, postType, updates }),
    typeof updates.slug === 'string' || updates.title
      ? createPostSlug(post, updates.slug, options)
      : Promise.resolve(),
    insertImages({ options, postId: post.id, updates }),
    communityReview,
    createPostRevision(post.id, 'create', changes, creator.id, options),
  ])
  const postCategoryFinalization = await persistPostCategoryFinalization(
    post.id,
    creator.id,
    creator.id,
    'create',
    options,
  )
  return { communityReviews: review ? [review] : [], postCategoryFinalization }
}

async function insertReviewRatings({
  options,
  postId,
  postType,
  updates,
}: {
  options: QueryOptions
  postId: string
  postType: string
  updates: CreatePostInput
}): Promise<void> {
  if (postType !== 'review') return
  const ratings = updates.review_topic_ratings
  assertValidReviewTopicRatings(ratings)
  const topicIds = ratings.map(r => r.topic_id)
  await assertReviewTopicsAllowReviews(topicIds)
  await write(
    sql`/* createPost */
      INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index)
      SELECT ${postId}, topic_id, rating, order_index
      FROM UNNEST(
        ${topicIds}::uuid[],
        ${ratings.map(r => r.rating)}::smallint[],
        ${ratings.map((_, i) => i)}::int[]
      ) AS t(topic_id, rating, order_index)
    `,
    options,
  )
}

async function insertDataPointTopics({
  options,
  postId,
  postType,
  updates,
}: {
  options: QueryOptions
  postId: string
  postType: string
  updates: CreatePostInput
}): Promise<void> {
  if (postType !== 'data_point') return
  const dpTopicIds = (updates.structured_data as { topic_ids: string[] }).topic_ids
  await insertPostDataPointTopics(postId, dpTopicIds, options)
}

/**
 * Data-point topic relations are part of the submitted post, so persist the relation rows in the
 * admission transaction rather than relying on a post-commit callback that can be lost on crash.
 * The category-finalization record remains the durable worker-owned source for user-generated
 * category votes; structural data-point relation votes are refreshed in this transaction.
 */
async function insertDataPointTopicRelations({
  creator,
  options,
  post,
  postType,
  updates,
}: {
  creator: PrivateUser
  options: QueryOptions
  post: { id: string }
  postType: string
  updates: CreatePostInput
}): Promise<void> {
  if (postType !== 'data_point') return
  const topicIds = (updates.structured_data as { topic_ids: string[] }).topic_ids
  if (topicIds.length === 0) return
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  await writeEntityRelations(
    relation,
    creator,
    topicIds.map(id => ({ subject: { id: post.id }, object: { id } })),
    options,
  )
}

async function insertImages({
  options,
  postId,
  updates,
}: {
  options: QueryOptions
  postId: string
  updates: CreatePostInput
}): Promise<void> {
  if (!updates.images?.length) return
  await write(
    sql`/* createPost */
      INSERT INTO post_images (post_id, image_id, order_index, caption)
      SELECT ${postId}, image_id, order_index, caption
      FROM UNNEST(
        ${updates.images.map(img => img.image_id)}::uuid[],
        ${updates.images.map(img => img.order_index)}::int[],
        ${updates.images.map(img => img.caption ?? '')}::text[]
      ) AS t(image_id, order_index, caption)
    `,
    options,
  )
}
