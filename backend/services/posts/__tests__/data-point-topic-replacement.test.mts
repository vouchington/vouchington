import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestCard,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getPostDataPointTopicIdsForTest } from '@voucha/test-helpers/post-data-point-topics'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postContentLimitsConfig } from '@services/post-content-limits'
import { manualTagLimitConfig } from '@services/tag-limits'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'

function makeStructuredData(topicIds: string[]) {
  return {
    vertical: 'credit_card',
    schema_version: 1,
    currency: 'usd',
    topic_ids: topicIds,
    result: 'approved',
    credit_score_range: '740-799',
  }
}

describe('data-point topic replacement', () => {
  it('replaces a full set of data-point topics with the new set', async () => {
    const creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const restoreContentLimits = overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
      data_point_topic_ids_max_items: 20,
    })
    const restoreTagLimits = overrideDynamicConfigFieldsForTest(manualTagLimitConfig, {
      free: 20,
      just_joined: 20,
    })
    try {
      const topicIds = await Promise.all(
        Array.from({ length: 21 }, () => insertTestCard({ createdById: creator.id })),
      )
      const [replacementId, ...fullSet] = topicIds
      const post = await createPost(creator, WEB_PROVENANCE, {
        post_type: 'data_point',
        title: `Full data-point topic set ${createRandomString(8)}`,
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData(fullSet),
      })

      await updatePost(creator, post!, {
        data_point_vertical: 'credit_card',
        structured_data: makeStructuredData([replacementId!]),
      })

      expect(await getPostDataPointTopicIdsForTest(post!.id)).toEqual([replacementId])
    } finally {
      restoreTagLimits()
      restoreContentLimits()
    }
  })
})
