import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestPost,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestRssFeedItemSourceBatch } from '@voucha/test-helpers/entities/publication-impact-batches'
import { registerTestRssCategoryIdentity } from '@voucha/test-helpers/entities/rss-category-identities'
import { insertTestExpandedPublicationCategory } from '@voucha/test-helpers/entities/publication-expanded-category'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics/deletion'
import { createTopHashtagAliasForTest } from '@voucha/test-helpers/entities/top-hashtags'
import { insertTestPostDataTopics } from '@voucha/test-helpers/publication-test-queries'
import { executeTestPublicationChain } from '@voucha/test-helpers/publication-effect-chain'
import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { caches } from '@services/entity-cache/caches'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { processApplyPostPublicationEffects } from './direct-effects.mts'

function change(scope: PostPublicationEffectsJobData['scope']): PostPublicationEffectsJobData {
  return {
    changeId: randomUUID(),
    postId: scope.type === 'post' ? scope.id : null,
    scope,
    reason: 'post_topics_changed',
    keys: [],
    keyHash: hashCapturedPublicationKeys([]),
    chunkIndex: 0,
    scopeStart: true,
    scopeTopicKeysCaptured: false,
    keyOffset: 0,
  }
}

describe('paged topic publication identities', () => {
  it('invalidates merged-source IDs, slugs and aliases beyond one page after post topic discovery', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 2 }),
    )
    const author = await createTestUser()
    const destination = await createTestTopic({
      hostname: `topic-effect-${randomUUID()}.example.com`,
    })
    const sources = await Promise.all(
      [0, 1, 2].map(() =>
        createTestTopic({ hostname: `merged-effect-${randomUUID()}.example.com` }),
      ),
    )
    const aliases = sources.map(() => `merged-effect-${randomUUID()}`)
    await Promise.all(
      sources.map((source, index) => createTopHashtagAliasForTest(source.id, aliases[index]!)),
    )
    await Promise.all(
      sources.map(source => mergeTopicForTest(source.id, destination.id, author.id)),
    )
    const slug = `topic-effects-post-${randomUUID()}`
    const postId = await insertTestPost({
      title: slug,
      slug,
      createdById: author.id,
      markdown: 'Topic publication fixture.',
    })
    await insertTestPostDataTopics(postId, [destination.id])
    const keys = sources.flatMap(source => [source.id, source.slug])
    await Promise.all(keys.map(key => caches.topic_metrics.set(key, 'stale merged-source metrics')))
    await Promise.all(aliases.map(alias => caches.topic_metrics.set(alias, 'stale alias metrics')))
    await executeTestPublicationChain(
      change({ type: 'post', id: postId }),
      processApplyPostPublicationEffects,
    )
    expect(await Promise.all(keys.map(key => caches.topic_metrics.get(key)))).toEqual(
      keys.map(() => null),
    )
    expect(await Promise.all(aliases.map(alias => caches.topic_metrics.get(alias)))).toEqual(
      aliases.map(() => null),
    )
  })

  it.each([1, 2])(
    'applies every expanded category topic at raw cap %i and reaches EOF',
    async limit => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
          capture_batch_size: limit,
        }),
      )
      const topics = await Promise.all(
        [0, 1, 2, 3, 4].map(() =>
          createTestTopic({ hostname: `expanded-effect-${randomUUID()}.example.com` }),
        ),
      )
      const feed = await insertTestRssFeedDirect({ topicId: topics[4]!.id })
      const [itemId] = await insertTestRssFeedItemSourceBatch({
        count: 1,
        rssFeedId: feed.id,
        urlId: feed.rss_feed_url_id,
      })
      const aliasNames = [0, 1].map(() => `expanded-effect-${randomUUID()}`)
      const aliases = await Promise.all(
        aliasNames.map((alias, index) =>
          createTopHashtagAliasForTest(topics[index + 2]!.id, alias),
        ),
      )
      const categories = await Promise.all(
        [0, 1].map(() => registerTestRssCategoryIdentity(`expanded-effect-${randomUUID()}`)),
      )
      await Promise.all(
        categories.map((categoryId, index) =>
          insertTestExpandedPublicationCategory({
            itemId: itemId!,
            categoryId,
            topicId: topics[index]!.id,
            aliasId: aliases[index]!,
          }),
        ),
      )
      const keys = [...topics.flatMap(topic => [topic.id, topic.slug]), ...aliasNames]
      await Promise.all(keys.map(key => caches.topic_metrics.set(key, 'stale expanded metrics')))
      const initial = change({ type: 'rss_feed', id: feed.id })
      initial.continuation = {
        kind: 'rss_feed_item_categories',
        subjectIds: [itemId!],
        subjectIndex: 0,
        after: null,
      }
      const admitted = await executeTestPublicationChain(
        initial,
        processApplyPostPublicationEffects,
      )
      expect(await Promise.all(keys.map(key => caches.topic_metrics.get(key)))).toEqual(
        keys.map(() => null),
      )
      for (const topic of topics)
        expect(admitted).toContainEqual({
          name: VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB.name,
          data: { topicId: topic.id },
        })
      const children = admitted
        .filter(job => job.name === POST_PUBLICATION_EFFECTS_JOB.name)
        .map(job => job.data as PostPublicationEffectsJobData)
      expect(
        children.some(
          job =>
            job.continuation?.kind === 'rss_feed_item_categories' &&
            job.continuation.after === categories.toSorted().at(-1),
        ),
      ).toBe(true)
      expect(
        children.filter(
          job =>
            job.continuation?.kind === 'topic_merged_sources' &&
            job.continuation.subjectIds[0] === topics[4]!.id,
        ),
      ).toHaveLength(1)
    },
  )
})
