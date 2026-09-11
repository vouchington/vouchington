import { describe, expect, it } from 'vitest'

import {
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
} from '@voucha/test-helpers'
import { getTopicViewerCounts } from '../metrics.mts'

describe('getTopicViewerCounts — hashtag aliases', () => {
  it('counts posts categorized only through a linked hashtag alias', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    const topic = await createTestTopic({
      user,
      name: `Viewer Alias Counts ${Math.random().toString(36).slice(2, 8)}`,
      topic_type: 'topic',
    })
    const post = await createTestPost({
      user,
      title: `Alias Discussion ${Date.now()}`,
      post_type: 'discussion',
      broadcast: 'everyone',
      privacy: 'public',
    })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `viewer-alias-${post.id}`)
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: '#viewer-alias',
    })

    const viewer = await createTestUser()
    if (!viewer) throw new Error('Failed to create test viewer')
    await expect(getTopicViewerCounts(viewer, topic.id)).resolves.toMatchObject({ discussions: 1 })
  })

  it('counts a post with a positive alias relation but no source row', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    const topic = await createTestTopic({
      user,
      name: `Viewer Alias No Source Counts ${Math.random().toString(36).slice(2, 8)}`,
      topic_type: 'topic',
    })
    const post = await createTestPost({
      user,
      title: `Alias Discussion Without Source ${Date.now()}`,
      post_type: 'discussion',
      broadcast: 'everyone',
      privacy: 'public',
    })
    const aliasId = await createTopHashtagAliasForTest(
      topic.id,
      `viewer-alias-no-source-${post.id}`,
    )
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
    })

    const viewer = await createTestUser()
    if (!viewer) throw new Error('Failed to create test viewer')
    await expect(getTopicViewerCounts(viewer, topic.id)).resolves.toMatchObject({ discussions: 1 })
  })
})
