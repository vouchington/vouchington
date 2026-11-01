import { describe, expect, it } from 'vitest'

import {
  invalidTopicRowFailures,
  seedTopicCsvCatalogFailures,
  seedTopicCsvShapeFailures,
  unknownTopicColumnFailures,
  type TopicCsvFile,
} from './seed-topic-csv-policy.mts'

function topicFile(file: string, rows: Record<string, string>[]): TopicCsvFile {
  return { file, rows }
}

function topicRow(overrides: Record<string, string> = {}): Record<string, string> {
  return { slug: 'alpha', name: 'Alpha', topic_type: 'topic', ...overrides }
}

const alphaFile = 'alpha-topics.csv'
const betaFile = 'beta-topics.csv'

describe('seed topic CSV shape', () => {
  it('reports each catalog minimum that the shipped files miss', () => {
    expect(seedTopicCsvShapeFailures(7, 299, 69)).toEqual([
      'expected at least 8 *-topics.csv files, found 7',
      'expected at least 300 topic rows, found 299',
      'expected at least 70 rss_feed_url rows, found 69',
    ])
  })

  it('passes at the minimum and above it', () => {
    expect(seedTopicCsvShapeFailures(8, 300, 70)).toEqual([])
    expect(seedTopicCsvShapeFailures(9, 301, 71)).toEqual([])
  })

  it('reports only the row minimum when the file and feed counts pass', () => {
    expect(seedTopicCsvShapeFailures(8, 299, 70)).toEqual([
      'expected at least 300 topic rows, found 299',
    ])
  })
})

describe('seed topic CSV catalog', () => {
  it('accepts a topic row and a feed row that meet the field rules', () => {
    const catalog = seedTopicCsvCatalogFailures([
      topicFile(alphaFile, [
        topicRow(),
        topicRow({
          slug: 'alpha-feed',
          name: 'Alpha Feed',
          topic_type: 'rss_feed',
          parent_slugs: 'alpha',
          rss_feed_url: 'https://example.com/feed.xml',
          rss_feed_title: 'Alpha Feed',
          feed_type: 'article',
        }),
      ]),
    ])

    expect(catalog.failures).toEqual([])
    expect(catalog.rowCount).toBe(2)
    expect(catalog.feedCount).toBe(1)
  })

  it('accepts a trimmed parent token', () => {
    const catalog = seedTopicCsvCatalogFailures([
      topicFile(alphaFile, [topicRow(), topicRow({ slug: 'child', parent_slugs: ' alpha ' })]),
    ])

    expect(catalog.failures).toEqual([])
    expect(catalog.rowCount).toBe(2)
    expect(catalog.feedCount).toBe(0)
  })

  it('reports an empty file', () => {
    expect(seedTopicCsvCatalogFailures([topicFile('empty-topics.csv', [])])).toEqual({
      failures: ['empty-topics.csv: has no rows'],
      rowCount: 0,
      feedCount: 0,
    })
  })

  it('reports a missing required column and the empty slug and name', () => {
    expect(seedTopicCsvCatalogFailures([topicFile(alphaFile, [{ topic_type: 'topic' }])])).toEqual({
      failures: [
        'alpha-topics.csv: missing column name',
        'alpha-topics.csv: missing column slug',
        'alpha-topics.csv: slug "" is invalid',
        'alpha-topics.csv: slug "" name length 0',
      ],
      rowCount: 1,
      feedCount: 0,
    })
  })

  it('reports an invalid slug, a long name, and an unknown topic type', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [
          topicRow({
            slug: 'Bad Slug',
            name: 'a'.repeat(201),
            topic_type: 'nope',
          }),
        ]),
      ]).failures,
    ).toEqual([
      'alpha-topics.csv: slug "Bad Slug" is invalid',
      'alpha-topics.csv: slug "Bad Slug" name length 201',
      'alpha-topics.csv: slug "Bad Slug" topic_type "nope" is invalid',
    ])
  })

  it('reports a duplicate slug inside one file', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [topicRow(), topicRow({ name: 'Alpha Again' })]),
      ]).failures,
    ).toEqual([
      'alpha-topics.csv: duplicate slug "alpha"',
      '"alpha" in both alpha-topics.csv and alpha-topics.csv',
    ])
  })

  it('reports a slug that appears in two files', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [topicRow()]),
        topicFile(betaFile, [topicRow({ name: 'Beta Alpha' })]),
      ]).failures,
    ).toEqual(['"alpha" in both alpha-topics.csv and beta-topics.csv'])
  })

  it('reports a parent that is not in the catalog', () => {
    expect(
      seedTopicCsvCatalogFailures([topicFile(alphaFile, [topicRow({ parent_slugs: 'missing' })])])
        .failures,
    ).toEqual([
      'alpha-topics.csv: slug "alpha" parent_slugs -> "missing"',
      'alpha: parent_slugs -> "missing"',
    ])
  })

  it('reports an rss feed whose parent is another rss feed', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [
          topicRow(),
          topicRow({
            slug: 'parent-feed',
            name: 'Parent Feed',
            topic_type: 'rss_feed',
            parent_slugs: 'alpha',
            rss_feed_url: 'https://example.com/parent.xml',
            rss_feed_title: 'Parent Feed',
            feed_type: 'podcast',
          }),
          topicRow({
            slug: 'child-feed',
            name: 'Child Feed',
            topic_type: 'rss_feed',
            parent_slugs: 'parent-feed',
            rss_feed_url: 'https://example.com/child.xml',
            rss_feed_title: 'Child Feed',
            feed_type: 'video',
          }),
        ]),
      ]).failures,
    ).toEqual(['alpha-topics.csv: "child-feed" parent "parent-feed" is also rss_feed'])
  })

  it('reports an invalid extension', () => {
    expect(
      seedTopicCsvCatalogFailures([topicFile(alphaFile, [topicRow({ extensions: 'nope' })])])
        .failures,
    ).toEqual(['alpha-topics.csv: slug "alpha" extension "nope" is invalid'])
  })

  it('reports an alias that collides with another slug', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [topicRow(), topicRow({ slug: 'beta', aliases: 'Alpha' })]),
      ]).failures,
    ).toEqual(['alpha-topics.csv: alias "Alpha" of "beta" collides with slug "alpha"'])
  })

  it('reports a repeated referral validation slug', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [topicRow({ referral_validation_slug: 'acme' })]),
        topicFile(betaFile, [
          topicRow({ slug: 'beta', name: 'Beta', referral_validation_slug: 'acme' }),
        ]),
      ]).failures,
    ).toEqual(['referral_validation_slug "acme" in both alpha-topics.csv and beta-topics.csv'])
  })

  it('reports a referral company that is not in the catalog', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [topicRow({ referral_company_slug: 'missing-co' })]),
      ]).failures,
    ).toEqual([
      'alpha-topics.csv: referral_company_slug "missing-co" for "alpha" not found in any topic CSV',
      'alpha: referral_company_slug -> "missing-co"',
    ])
  })

  it('reports a referral program name that omits the required suffix', () => {
    expect(
      seedTopicCsvCatalogFailures([
        topicFile(alphaFile, [
          topicRow(),
          topicRow({
            slug: 'acme-referral',
            name: 'Acme',
            topic_type: 'referral_program',
            referral_validation_slug: 'acme',
            referral_company_slug: 'alpha',
          }),
        ]),
      ]).failures,
    ).toEqual([
      'alpha-topics.csv: "acme-referral" name "Acme" does not end with "Referral Program"',
    ])
  })
})

describe('seed topic CSV importer messages', () => {
  it('formats unknown columns from the importer allow-list', () => {
    expect(unknownTopicColumnFailures(alphaFile, [])).toEqual([])
    expect(unknownTopicColumnFailures(alphaFile, ['extra'])).toEqual([
      'alpha-topics.csv: unknown columns extra',
    ])
  })

  it('formats importer row errors with the row index and slug', () => {
    expect(
      invalidTopicRowFailures(
        'catalog',
        [{ slug: 'bad slug', name: 'Bad', topic_type: 'topic' }],
        [
          {
            row_index: 0,
            valid: false,
            errors: ['slug must only contain lowercase letters, numbers, and hyphens'],
          },
        ],
      ),
    ).toEqual([
      'catalog row 0 (bad slug): slug must only contain lowercase letters, numbers, and hyphens',
    ])
    expect(
      invalidTopicRowFailures(alphaFile, [topicRow()], [{ row_index: 0, valid: true, errors: [] }]),
    ).toEqual([])
  })
})
