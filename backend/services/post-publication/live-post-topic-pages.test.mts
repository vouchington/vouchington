import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { insertTestPostDataTopics } from '../../test-helpers/publication-test-queries.mts'
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
  it.each([
    'post_data_topics',
    'post_review_topics',
    'post_topic_relations',
    'post_alias_relations',
  ] as const)('preserves the %s query annotation and continuation bindings', async family => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: 2,
    })
    onTestFinished(restore)
    const postId = crypto.randomUUID()
    const after = crypto.randomUUID()
    const { result, queries } = await withCapturedTestQueries(() =>
      listLivePostTopicPage(postId, family, after),
    )
    expect(result).toEqual({ topicIds: [], cursor: null })
    const page = queries.find(query =>
      query.text.startsWith(`/* listLivePostTopicPage:${family} */`),
    )
    expect(page).toBeDefined()
    expect(page?.values).toEqual([postId, after, 2])
    expect(page?.text.includes('source.deleted_at IS NULL')).toBe(
      family === 'post_topic_relations' || family === 'post_alias_relations',
    )
    expect(page?.text.includes('source.votes_score_net > 0')).toBe(
      family === 'post_alias_relations',
    )
  })

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
    await insertTestPostDataTopics(postId, expected)

    const first = await listLivePostTopicPage(postId, 'post_data_topics', null)
    expect(first).toEqual({ topicIds: expected.slice(0, 2), cursor: expected[1] })
    const second = await listLivePostTopicPage(postId, 'post_data_topics', first.cursor)
    expect(second).toEqual({ topicIds: expected.slice(2), cursor: null })
  })
})
