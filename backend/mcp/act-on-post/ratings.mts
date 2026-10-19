import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { addPostRating, updatePostRating, deletePostRating } from '@services/posts/post-ratings'
import {
  assertPostRatingOrderIndex,
  assertPostRatingTopicId,
  assertPostRatingValue,
} from '@services/posts/post-rating-target'
import {
  getAuthorizedPostContributionMembershipPlan,
  loadPostRatingTarget,
} from '@services/posts/authorization'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import type { MergedToolSource } from '../create-merged-tool.mts'
import { POST_TARGET_SCHEMA, postActionMeta } from './meta.mts'
import { getDelegatedToolAuthority } from '../delegated-authority.mts'
import { requireActiveToolUser } from '../private-user.mts'
import { successSchema } from '../output-schema-shapes.mts'
import { topicReferenceSchema } from '../entity-reference-schema.mts'
import { canonicalEntityId } from '../resolve-entity-reference.mts'

type RatingArgs = { id: string; topic_id: string; rating?: number; order_index?: number }
type Success = { success: true }

const TOPIC = topicReferenceSchema
const RATING = { type: 'integer', minimum: 1, maximum: 5 }
const ORDER = { type: 'integer', minimum: 0 }
const COLLECTION = '/api/v1/posts/:idOrSlug/ratings'
const ITEM = `${COLLECTION}/:topicId`

function ratingSource(
  description: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  fields: Record<string, unknown>,
  required: string[],
  run: (user: PrivateUser, args: RatingArgs) => Promise<void>,
): MergedToolSource<RatingArgs, Success> {
  return {
    schema: {
      description,
      parameters: {
        type: 'object',
        properties: { id: POST_TARGET_SCHEMA, topic_id: TOPIC, ...fields },
        required: ['id', 'topic_id', ...required],
      },
    },
    meta: postActionMeta(
      [{ method, path: method === 'POST' ? COLLECTION : ITEM }],
      successSchema({}),
    ),
    function: currentUser => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      getDelegatedToolAuthority(user, invocationContext)
      const topicId = await canonicalEntityId('topic', args.topic_id)
      assert(topicId, 404, 'Not found')
      await run(user, { ...args, topic_id: topicId })
      return { success: true }
    },
  }
}

export const addPostRatingSource = ratingSource(
  'Rate a topic on a review you may edit. Ratings may not all match when several topics are rated.',
  'POST',
  { rating: RATING, order_index: ORDER },
  ['rating', 'order_index'],
  async (user, args) => {
    const membershipPlan = await getAuthorizedPostContributionMembershipPlan(user)
    const post = await loadPostRatingTarget(user, args.id)
    assertPostRatingTopicId(args.topic_id)
    assertPostRatingValue(args.rating)
    assertPostRatingOrderIndex(args.order_index)
    await assertWithinContributionActionLimit(user, membershipPlan, 'post_rating')
    await addPostRating(user, post, {
      topic_id: args.topic_id,
      rating: args.rating,
      order_index: args.order_index,
    })
  },
)

export const editPostRatingSource = ratingSource(
  'Change the rating or order_index of a topic already rated on a review you may edit. Send at least one.',
  'PATCH',
  { rating: RATING, order_index: ORDER },
  [],
  async (user, args) => {
    const membershipPlan = await getAuthorizedPostContributionMembershipPlan(user)
    const post = await loadPostRatingTarget(user, args.id)
    assertPostRatingTopicId(args.topic_id)
    const { rating, order_index } = args
    assert(
      rating !== undefined || order_index !== undefined,
      422,
      'At least one of rating or order_index must be provided',
    )
    if (rating !== undefined) assertPostRatingValue(rating)
    if (order_index !== undefined) assertPostRatingOrderIndex(order_index)
    await assertWithinContributionActionLimit(user, membershipPlan, 'post_rating')
    await updatePostRating(user, post, args.topic_id, { rating, order_index })
  },
)

export const deletePostRatingSource = ratingSource(
  'Remove a topic rating from a review you may edit.',
  'DELETE',
  {},
  [],
  async (user, args) => {
    const post = await loadPostRatingTarget(user, args.id)
    assertPostRatingTopicId(args.topic_id)
    await deletePostRating(user, post, args.topic_id)
  },
)
