import { describe, expect, it } from 'vitest'

import { seedTopicCsvCatalogFailures, type TopicCsvFile } from './seed-topic-csv-policy.mts'

function topicFile(file: string, rows: Record<string, string>[]): TopicCsvFile {
  return { file, rows }
}

function topicRow(overrides: Record<string, string> = {}): Record<string, string> {
  return { slug: 'alpha', name: 'Alpha', topic_type: 'topic', ...overrides }
}

describe('seed topic CSV feed fields', () => {
  it('reports an invalid feed URL', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile('alpha-topics.csv', [
          topicRow(),
          topicRow({
            slug: 'alpha-feed',
            name: 'Alpha Feed',
            topic_type: 'rss_feed',
            parent_slugs: 'alpha',
            rss_feed_url: 'not a url',
            rss_feed_title: 'Alpha Feed',
            feed_type: 'mixed',
          }),
        ]),
      ]).failures,
    ).toEqual(['alpha-topics.csv: slug "alpha-feed" rss_feed_url is invalid'])
  })

  it('reports an unpaired feed title and a feed field on a plain topic', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile('alpha-topics.csv', [topicRow({ rss_feed_title: 'Orphan title' })]),
      ]).failures,
    ).toEqual([
      'alpha-topics.csv: slug "alpha" rss_feed_url and rss_feed_title must be paired',
      'alpha-topics.csv: slug "alpha" (type=topic) has an rss feed field',
    ])
  })

  it('reports the feed fields an rss feed row must have', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile('alpha-topics.csv', [
          topicRow(),
          topicRow({
            slug: 'alpha-feed',
            name: 'Alpha Feed (https://example.com/feed.xml)',
            topic_type: 'rss_feed',
            feed_type: 'nope',
          }),
        ]),
      ]).failures,
    ).toEqual([
      'alpha-topics.csv: "alpha-feed" rss_feed missing parent_slugs',
      'alpha-topics.csv: "alpha-feed" rss_feed missing rss_feed_url',
      'alpha-topics.csv: "alpha-feed" rss_feed missing rss_feed_title',
      'alpha-topics.csv: "alpha-feed" name "Alpha Feed (https://example.com/feed.xml)" already contains a URL suffix',
      'alpha-topics.csv: "alpha-feed" feed_type "nope" is not one of article, podcast, video, mixed',
    ])
  })

  it('reports a feed type on a topic that is not an rss feed', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile('alpha-topics.csv', [topicRow({ feed_type: 'article' })]),
      ]).failures,
    ).toEqual([
      'alpha-topics.csv: "alpha" feed_type "article" set on non-rss_feed topic (type=topic)',
    ])
  })
})
