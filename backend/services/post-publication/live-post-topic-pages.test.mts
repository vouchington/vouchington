import { write } from '@data-stores/psql'
import {
  createTestTopic,
  createTestUser,
  hardDeleteTestPosts,
  insertTestPost,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { describe, expect, it, onTestFinished } from 'vitest'
import { listLivePostTopicPage } from './live-post-topic-pages.mts'
import { postPublicationWorkConfig } from './work-limits.mts'

describe('live post topic continuation', () => {
  it('reads each current topic once in index order under the configured page bound', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: 2,
    })
    onTestFinished(restore)
    const user = await createTestUser()
    const nonce = crypto.randomUUID()
    const postId = await insertTestPost({
      title: `Paged topic identities ${nonce}`,
      slug: `paged-topic-identities-${nonce}`,
      markdown: '',
      createdById: user.id,
      postType: 'data_point',
    })
    onTestFinished(() => hardDeleteTestPosts([postId]))
    const topics = await Promise.all(
      [0, 1, 2].map(index =>
        createTestTopic({ hostname: `paged-topic-${index}-${nonce}.example.com` }),
      ),
    )
    const expected = topics.map(topic => topic.id).toSorted()
    await write(
      `/* seedLivePostTopicPageTest */
      INSERT INTO post_data_point_topics (post_id, topic_id)
      SELECT $1::uuid, input.topic_id FROM unnest($2::uuid[]) input(topic_id)`,
      [postId, expected],
    )

    const first = await listLivePostTopicPage(postId, 'post_data_topics', null)
    expect(first).toEqual({ topicIds: expected.slice(0, 2), cursor: expected[1] })
    const second = await listLivePostTopicPage(postId, 'post_data_topics', first.cursor)
    expect(second).toEqual({ topicIds: expected.slice(2), cursor: null })
  })
})
