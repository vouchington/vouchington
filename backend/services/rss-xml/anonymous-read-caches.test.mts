import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { valkeyEvents } from 'valkyries'
import { caches } from '@services/entity-cache/caches'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { createTestTopic, createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { resolveHashtagTopicSearch } from '@services/search-params/hashtag-topic-search'
import { searchWebCached } from '@services/web-search/search'
import { searchPrimaryEnabledRssFeedIdsByTopicIdsCached } from '@services/rss-feeds/search-by-topic-ids'
import { renderPostDescriptions } from '@services/rss-xml/posts-feed-descriptions'
import { buildPostsRssFeed } from '@services/rss-xml/posts-feed'
import { getPostIdsCached, searchRssFeedItemsCached } from '@services/entity-fetch/search-caches'
import {
  POST_IDS_ANON_CACHE,
  RSS_FEED_ITEMS_ANON_CACHE,
} from '@services/entity-cache/anonymous-search-prefixes'

// Wait for the first write before proving the next read avoids PostgreSQL.
async function expectCachedRead<T>(prefix: string | string[], run: () => Promise<T>): Promise<T> {
  const pending = new Set(typeof prefix === 'string' ? [prefix] : prefix)
  const stored = Promise.withResolvers<void>()
  const onSet = (event: { cacheName: string }) => {
    pending.delete(event.cacheName)
    if (pending.size === 0) stored.resolve()
  }
  valkeyEvents.on('cache:set', onSet)
  try {
    const first = await run()
    await stored.promise
    const { result, queries } = await withCapturedTestQueries(run)
    expect(result).toEqual(first)
    expect(queries).toEqual([])
    return result
  } finally {
    valkeyEvents.off('cache:set', onSet)
  }
}

describe('anonymous read caches', () => {
  it('caches web search including empty results and keeps cursors distinct', async () => {
    const query = `cache${randomUUID().replaceAll('-', '')}`
    const result = await expectCachedRead('web_search_anon', () => searchWebCached({ query }))
    expect(result.results).toEqual([])
    await expect(searchWebCached({ query, after: 'invalid' })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('caches hashtag topic resolution while preserving surrounding text', async () => {
    const topic = await createTestTopic()
    const result = await expectCachedRead('hashtag_topics_anon', () =>
      resolveHashtagTopicSearch(`hello #${topic.slug}`),
    )
    expect(result.topicIds).toEqual([topic.id])
    expect(result.textSearchQuery).toBe('hello')
  })

  it('caches source feed resolution', async () => {
    const topic = await createTestTopic()
    expect(
      await expectCachedRead('rss_primary_enabled_feed_ids_anon', () =>
        searchPrimaryEnabledRssFeedIdsByTopicIdsCached([topic.id]),
      ),
    ).toEqual([])
  })

  it('caches descriptions and their admin role lookup', async () => {
    const creator = await createTestUserDirect({ administrator: true })
    const post = { markdown: `<b>${randomUUID()}</b>`, created_by_id: creator.id }
    const result = await expectCachedRead('rss_post_descriptions_anon', () =>
      renderPostDescriptions([post]),
    )
    expect(result[0]).toContain(post.markdown)
  })

  it.each([false, true])('caches HN post filters (%s)', async has_hacker_news_references => {
    const user = await createTestUserDirect()
    const result = await expectCachedRead(POST_IDS_ANON_CACHE, () =>
      getPostIdsCached({
        user_id: user.id,
        has_hacker_news_references,
        sort: 'new',
        time_range: 'all',
      }),
    )
    expect(result.results).toEqual([])
  })

  it.each([false, true])('caches HN news filters (%s)', async has_hacker_news_references => {
    const rss_feed_ids = [randomUUID()]
    const result = await expectCachedRead(RSS_FEED_ITEMS_ANON_CACHE, () =>
      searchRssFeedItemsCached({ rss_feed_ids, has_hacker_news_references }),
    )
    expect(result.results).toEqual([])
  })

  it('serves a warm RSS post feed without publication or description queries', async () => {
    const user = await createTestUserDirect()
    await insertTestPost({
      title: 'Cached RSS',
      slug: `cached-rss-${randomUUID()}`,
      createdById: user.id,
      markdown: `RSS ${randomUUID()}`,
    })
    const xml = await expectCachedRead(
      [
        caches.users_public.prefix,
        caches.posts.prefix,
        POST_IDS_ANON_CACHE,
        'rss_post_descriptions_anon',
      ],
      async () =>
        (await buildPostsRssFeed({ username: user.username! })).replace(
          /<lastBuildDate>[^<]*<\/lastBuildDate>/g,
          '',
        ),
    )
    expect(xml).toContain('<item>')
  })
})
