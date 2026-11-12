import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  insertTestPost,
  createTopHashtagAliasForTest,
  createActivePostTopicAliasRelationForTest,
  createTestTopic,
  createTestUser,
  insertScoredPostTopicCategoryRelation,
  insertTestReview,
  insertTestDataPoint,
  setPostBroadcastForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { profileCountConfig } from '@services/users/profile-count-cap'
import { topicsWorkConfig } from '../work-limits.mts'
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

  it('reports zero as a lower bound when a later alias lies beyond the input budget', async () => {
    await topicsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      viewer_count_input_cap: 2,
    })
    try {
      const viewer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      const post = await createTestPost({ user: viewer, post_type: 'discussion' })
      for (const prefix of ['a', 'b'])
        await createTopHashtagAliasForTest(topic.id, `${prefix}-${topic.id}`)
      const omittedAlias = await createTopHashtagAliasForTest(topic.id, `z-${topic.id}`)
      await createActivePostTopicAliasRelationForTest({
        postId: post.id,
        topicAliasId: omittedAlias,
        userId: viewer.id,
      })
      expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
        discussions: 0,
        count_capped: { discussions: true, reviews: false, 'data-points': false },
      })
    } finally {
      restore()
    }
  })

  it('caps the global alias relation stream before deduplication', async () => {
    await topicsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      viewer_count_input_cap: 2,
    })
    try {
      const viewer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      const first = await createTestPost({ user: viewer, post_type: 'discussion' })
      const second = await createTestPost({ user: viewer, post_type: 'discussion' })
      const firstAlias = await createTopHashtagAliasForTest(topic.id, `a-${topic.id}`)
      const secondAlias = await createTopHashtagAliasForTest(topic.id, `b-${topic.id}`)
      for (const topicAliasId of [firstAlias, secondAlias]) {
        await createActivePostTopicAliasRelationForTest({
          postId: first.id,
          topicAliasId,
          userId: viewer.id,
        })
      }
      await createActivePostTopicAliasRelationForTest({
        postId: second.id,
        topicAliasId: secondAlias,
        userId: viewer.id,
      })
      expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
        discussions: 1,
        count_capped: { discussions: true },
      })
    } finally {
      restore()
    }
  })

  it('marks exact input exhaustion conservatively and becomes exact with more input room', async () => {
    await topicsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      viewer_count_input_cap: 1,
    })
    try {
      const viewer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      const post = await createTestPost({ user: viewer, post_type: 'discussion' })
      await insertScoredPostTopicCategoryRelation(post.id, topic.id, viewer.id)
      expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
        discussions: 1,
        count_capped: { discussions: true },
      })
      const restoreMore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
        viewer_count_input_cap: 2,
      })
      try {
        expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
          discussions: 1,
          count_capped: { discussions: false },
        })
      } finally {
        restoreMore()
      }
    } finally {
      restore()
    }
  })

  it('bounds raw direct inputs before checking viewer eligibility', async () => {
    await topicsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      viewer_count_input_cap: 1,
    })
    try {
      const viewer = await createTestUser()
      const author = await createTestUser()
      const topic = await createTestTopic({ user: author })
      const hidden = await insertTestPost({
        title: 'Hidden raw input',
        slug: `hidden-${topic.id}`,
        markdown: '',
        createdById: author.id,
        broadcast: 'followers',
        privacy: 'private',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
      const visible = await insertTestPost({
        title: 'Visible later input',
        slug: `visible-${topic.id}`,
        markdown: '',
        createdById: author.id,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      })
      for (const postId of [hidden, visible])
        await insertScoredPostTopicCategoryRelation(postId, topic.id, author.id)
      expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
        discussions: 0,
        count_capped: { discussions: true },
      })
      const restoreMore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
        viewer_count_input_cap: 3,
      })
      try {
        expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
          discussions: 1,
          count_capped: { discussions: false },
        })
      } finally {
        restoreMore()
      }
    } finally {
      restore()
    }
  })

  it.each(['reviews', 'data-points'] as const)(
    'bounds raw %s inputs before checking viewer eligibility',
    async kind => {
      await topicsWorkConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
        viewer_count_input_cap: 1,
      })
      try {
        const viewer = await createTestUser()
        const author = await createTestUser()
        const topic = await createTestTopic({ user: author })
        const insert = async (createdAt: Date): Promise<string> =>
          kind === 'reviews'
            ? insertTestReview({
                userId: author.id,
                topicRatings: [{ topicId: topic.id, rating: 5 }],
                createdAt,
              })
            : insertTestDataPoint({
                title: `Bounded ${topic.id}`,
                slug: `bounded-${topic.id}-${createdAt.getTime()}`,
                createdById: author.id,
                topicId: topic.id,
                createdAt,
              })
        const hidden = await insert(new Date('2026-01-01T00:00:00Z'))
        await setPostBroadcastForTest(hidden, 'followers')
        await insert(new Date('2026-01-02T00:00:00Z'))
        expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
          [kind]: 0,
          count_capped: { [kind]: true },
        })
        const restoreMore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
          viewer_count_input_cap: 3,
        })
        try {
          expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
            [kind]: 1,
            count_capped: { [kind]: false },
          })
        } finally {
          restoreMore()
        }
      } finally {
        restore()
      }
    },
  )

  it.each(['reviews', 'data-points'] as const)(
    'marks exact %s input exhaustion conservatively',
    async kind => {
      await topicsWorkConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
        viewer_count_input_cap: 1,
      })
      try {
        const viewer = await createTestUser()
        const topic = await createTestTopic({ user: viewer })
        if (kind === 'reviews')
          await insertTestReview({
            userId: viewer.id,
            topicRatings: [{ topicId: topic.id, rating: 5 }],
          })
        else
          await insertTestDataPoint({
            title: `Exact ${topic.id}`,
            slug: `exact-${topic.id}`,
            createdById: viewer.id,
            topicId: topic.id,
          })
        expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
          [kind]: 1,
          count_capped: { [kind]: true },
        })
        const restoreMore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
          viewer_count_input_cap: 2,
        })
        try {
          expect(await getTopicViewerCounts(viewer, topic.id)).toMatchObject({
            [kind]: 1,
            count_capped: { [kind]: false },
          })
        } finally {
          restoreMore()
        }
      } finally {
        restore()
      }
    },
  )
})
