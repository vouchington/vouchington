import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'
import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { assertWithinStandingTagLimit, assertWithinTagAddLimit } from '@services/tag-limits'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { getPostHashtagKeys } from '../hashtags.mts'
import { normalizeHashtag } from '@ts-shared/utils'

export async function validatePostCategories(
  creator: PrivateUser,
  membershipPlan: ContributionLimitMembershipPlan,
  updates: CreatePostInput,
  options: {
    dataPointTopicIds?: ReadonlySet<string>
    standingCounts?: { existing: number; final: number }
  } = {},
): Promise<void> {
  if (updates.categories !== undefined) {
    assert(Array.isArray(updates.categories), 422, 'categories must be an array')
  }
  const topicIds = new Set<string>()
  for (const category of updates.categories ?? []) {
    assert(category && typeof category === 'object', 422, 'Invalid category')
    if (category.type === 'topic') {
      assert(
        typeof category.topic_id === 'string' && isUUID(category.topic_id),
        422,
        'Invalid topic category',
      )
      topicIds.add(category.topic_id)
    } else {
      assert(
        category.type === 'hashtag' &&
          typeof category.hashtag === 'string' &&
          normalizeHashtag(category.hashtag),
        422,
        'Invalid hashtag category',
      )
    }
  }
  const topicIdArray = [...topicIds]
  const activeTopics = await getTopicsByAnyBatch(topicIdArray)
  for (const [index, topic] of activeTopics.entries()) {
    const topicId = topicIdArray[index]!
    assert(topic?.id === topicId, 422, 'Topic category must reference an active topic')
  }
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  if (options.standingCounts) {
    assertWithinStandingTagLimit(
      creator,
      membershipPlan,
      options.standingCounts.existing,
      options.standingCounts.final,
    )
    return
  }
  await assertWithinTagAddLimit(
    creator,
    membershipPlan,
    relation,
    null,
    new Set([...topicIds, ...(options.dataPointTopicIds ?? [])]).size +
      getPostHashtagKeys(updates).length,
  )
}
