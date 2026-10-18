import assert from 'http-assert'
import { isUUID } from '@modules/utils'

export function assertPostRatingTopicId(topicId: unknown): asserts topicId is string {
  assert(typeof topicId === 'string', 422, 'topic_id must be a string')
  assert(isUUID(topicId), 422, 'Invalid topic_id')
}

export function assertPostRatingValue(rating: unknown): asserts rating is number {
  assert(
    typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5,
    422,
    'Rating must be an integer between 1 and 5',
  )
}

export function assertPostRatingOrderIndex(orderIndex: unknown): asserts orderIndex is number {
  assert(
    typeof orderIndex === 'number' && Number.isInteger(orderIndex) && orderIndex >= 0,
    422,
    'order_index must be a non-negative integer',
  )
}
