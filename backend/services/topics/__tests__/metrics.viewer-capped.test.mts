import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTopHashtagAliasForTest,
  createActivePostTopicAliasRelationForTest,
  createTestTopic,
  createTestUser,
  insertScoredPostTopicCategoryRelation,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { profileCountConfig } from '@services/users/profile-count-cap'
import { getTopicViewerCounts } from '../metrics.mts'

describe('capped topic viewer counts', () => {
  it('deduplicates direct and multiple alias attachments before checking overflow', async () => {
    await profileCountConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(profileCountConfig, { count_cap: 1 })
    try {
      const viewer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      const first = await createTestPost({ user: viewer, post_type: 'discussion' })
      await insertScoredPostTopicCategoryRelation(first.id, topic.id, viewer.id)
      const aliases = await Promise.all([
        createTopHashtagAliasForTest(topic.id, `cap-first-${first.id}`),
        createTopHashtagAliasForTest(topic.id, `cap-second-${first.id}`),
      ])
      for (const topicAliasId of aliases) {
        await createActivePostTopicAliasRelationForTest({
          postId: first.id,
          topicAliasId,
          userId: viewer.id,
        })
      }
      expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
        discussions: 1,
        count_capped: { discussions: false, reviews: false, 'data-points': false },
      })
      const second = await createTestPost({ user: viewer, post_type: 'discussion' })
      await createActivePostTopicAliasRelationForTest({
        postId: second.id,
        topicAliasId: aliases[1]!,
        userId: viewer.id,
      })
      expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
        discussions: 1,
        count_capped: { discussions: true, reviews: false, 'data-points': false },
      })
    } finally {
      restore()
    }
  })
})
