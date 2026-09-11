import type { TopicMetrics } from '@services/topics/types'

type Query = <Row extends Record<string, unknown>>(
  text: string,
  values?: readonly unknown[],
) => Promise<{ rows: Row[] }>

interface SeedDependencies {
  core: typeof import('../../seed-data/core.mts')
  engagement: typeof import('../../seed-data/engagement.mts')
  maintenance: typeof import('../../seed-data/maintenance.mts')
  read: Query
  write: Query
  getTopicMetrics: (ids: string[]) => Promise<Array<TopicMetrics | null | undefined>>
}

export interface TopicMetricsBenchmarkSeed {
  topicIds: string[]
  associationCounts: Record<string, number>
  associationTotal: number
}

export async function seedTopicMetricsBenchmark({
  core,
  engagement,
  maintenance,
  read,
  write,
  getTopicMetrics,
}: SeedDependencies): Promise<TopicMetricsBenchmarkSeed> {
  await core.seedUsers(20_000)
  await core.seedHostnames(1_000)
  await core.seedUrls(3_100)
  await core.seedTopics(2_500)
  await core.seedPosts(300_000)
  await core.seedEntityRelations(300_000, 100_000, true)
  await engagement.seedPostReviewTopicRatings(300_000, 100_000)
  await engagement.seedPostDataPointTopics(300_000, 100_000)
  await core.seedRssFeeds(2_500, 40_000)
  await core.seedRssFeedItemCategories(40_000)

  // The standard RSS seed attaches each item to every feed on its hostname, deliberately
  // duplicating news joins. These mutations make eligibility exclusions observable too.
  await Promise.all([
    write(`
      /* benchmarkTopicMetricsIneligiblePost */
      UPDATE posts
      SET latest_clearance_change_id = NULL,
          approved_at = NULL
      WHERE id = (
        SELECT relation.subject_id
        FROM relation__post__category__topic relation
        JOIN posts post ON post.id = relation.subject_id
        WHERE relation.object_id = '019e0000-0400-7000-8000-000000000000'
          AND post.post_type = 'discussion'
        ORDER BY relation.subject_id
        LIMIT 1
      )
    `),
    write(`
      /* benchmarkTopicMetricsDeletedItem */
      UPDATE rss_feed_items
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT category.rss_feed_item_id
        FROM rss_feed_item_categories category
        WHERE category.topic_id = '019e0000-0400-7000-8000-000000000000'
        ORDER BY category.rss_feed_item_id
        LIMIT 1
      )
    `),
    write(`
      /* benchmarkTopicMetricsDisabledFeed */
      INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason)
      SELECT id, FALSE, 'topic metrics benchmark ineligible feed'
      FROM rss_feeds
      WHERE topic_id = (
        SELECT id FROM topics ORDER BY id LIMIT 1 OFFSET 99
      )
    `),
  ])
  await maintenance.runAnalyze()

  const topicIds = (
    await read<{ id: string }>(`
      /* benchmarkTopicMetricIds */
      SELECT id FROM topics ORDER BY id LIMIT 100
    `)
  ).rows.map(row => row.id)
  if (topicIds.length !== 100) {
    throw new Error(`benchmark requires 100 topic IDs; found ${topicIds.length}`)
  }

  const associationCounts = await getAssociationCounts(read)
  const associationTotal = Object.values(associationCounts).reduce((sum, count) => sum + count, 0)
  if (associationTotal < 1_000_000) {
    throw new Error(`benchmark seed created ${associationTotal} associations; expected >=1000000`)
  }

  const expectedMetrics = await getReferenceMetrics(read, topicIds)
  assertExactCounts(await getTopicMetrics(topicIds), expectedMetrics)
  return { topicIds, associationCounts, associationTotal }
}

async function getAssociationCounts(read: Query): Promise<Record<string, number>> {
  const { rows } = await read<Record<string, string>>(/* sql */ `
    /* benchmarkTopicMetricsAssociationCounts */
    SELECT
      (SELECT COUNT(*)::text FROM relation__post__category__topic) AS discussions,
      (SELECT COUNT(*)::text FROM post_review_topic_ratings) AS reviews,
      (SELECT COUNT(*)::text FROM post_data_point_topics) AS data_points,
      (SELECT COUNT(*)::text FROM rss_feed_item_categories) AS news,
      (SELECT COUNT(*)::text FROM rss_feed_item_sources) AS latest
  `)
  const row = rows[0]
  if (!row) throw new Error('association count query returned no row')
  return Object.fromEntries(Object.entries(row).map(([name, count]) => [name, Number(count)]))
}

async function getReferenceMetrics(read: Query, topicIds: string[]) {
  const { rows } = await read<Record<string, string>>(
    `/* benchmarkTopicMetricsReference */
     SELECT id, count__discussions, count__reviews, count__data_points, count__news, count__latest
     FROM view_topic_metrics
     WHERE id = ANY($1::uuid[])
     ORDER BY id`,
    [topicIds],
  )
  return new Map(rows.map(row => [row.id, row]))
}

function assertExactCounts(
  actual: Array<TopicMetrics | null | undefined>,
  expected: Map<string, Record<string, string>>,
): void {
  const familyTotals = [0, 0, 0, 0, 0]
  for (const metrics of actual) {
    if (!metrics) throw new Error('topic metrics benchmark returned a missing metric row')
    const reference = expected.get(metrics.id)
    if (!reference) throw new Error(`reference metrics missing ${metrics.id}`)
    const actualCounts = [
      metrics.count.discussions,
      metrics.count.reviews,
      metrics.count['data-points'],
      metrics.count.news,
      metrics.count.latest,
    ]
    const expectedCounts = [
      reference.count__discussions,
      reference.count__reviews,
      reference.count__data_points,
      reference.count__news,
      reference.count__latest,
    ].map(Number)
    if (actualCounts.some((count, index) => count !== expectedCounts[index])) {
      throw new Error(
        `topic metrics mismatch for ${metrics.id}: actual=${actualCounts.join(',')} expected=${expectedCounts.join(',')}`,
      )
    }
    for (const [index, count] of actualCounts.entries()) {
      familyTotals[index] = (familyTotals[index] ?? 0) + count
    }
  }
  if (familyTotals.some(count => count <= 0)) {
    throw new Error(
      `topic metrics benchmark requires every count family to be nonzero; totals=${familyTotals.join(',')}`,
    )
  }
}
