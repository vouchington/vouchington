import { write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function registerModerationJudgementBackfillPlan(scenario: string): Promise<void> {
  const { rows } = await write<{
    reports: number
    posts: number
    non_post: number
    judgements: number
  }>(
    `/* boundModerationJudgementBackfillPlan */
    SELECT count(*)::int AS reports, count(DISTINCT post_id)::int AS posts,
           (count(*) FILTER (WHERE post_id IS NULL))::int AS non_post,
           (SELECT count(*)::int FROM moderation_report_judgements) AS judgements
    FROM moderation_reports`,
  )
  const corpus = rows[0]!
  registerScenarioContract(scenario, {
    seededRows: {
      moderation_reports: corpus.reports,
      moderation_report_judgements: corpus.judgements,
    },
    crossPartition: {
      posts: 'The backfill streams reported targets across all creation months.',
      rss_feed_items: 'The backfill includes reported targets in every retention month.',
    },
    expectations: [
      // The post branch may scan the whole table; other branches revisit non-post reports.
      {
        kind: 'maxProcessedRows',
        relation: 'moderation_reports',
        max: corpus.reports + corpus.non_post,
      },
      { kind: 'maxProcessedRows', relation: 'posts', max: corpus.posts },
      // Allow two anti-join scans and the keyed probes for the smaller target branches.
      {
        kind: 'maxProcessedRows',
        relation: 'moderation_report_judgements',
        max: corpus.judgements * 3,
      },
    ],
  })
}
