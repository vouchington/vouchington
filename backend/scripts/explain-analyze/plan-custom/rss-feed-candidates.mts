import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'
import {
  HOSTNAME_COUNT,
  RSS_FEED_ITEM_SEED_COUNT,
  RSS_FEED_SEED_COUNT,
} from '../seed-data/common.mts'

// The join bound remains structural because rejected join rows are not scan rows.
const SOURCE_WORK_CEILING =
  RSS_FEED_ITEM_SEED_COUNT * Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT) * 3

export function assertRssFeedCandidatesAreSetBased(result: ExplainResult): void {
  if (!result.scenario_id?.startsWith('rss-feed-item-feed')) return
  const nodes = collectPlanNodes(result.plan)
  const joinRejections = nodes.reduce(
    (total, node) =>
      total + Number(node['Rows Removed by Join Filter'] ?? 0) * Number(node['Actual Loops'] ?? 1),
    0,
  )
  if (joinRejections > SOURCE_WORK_CEILING)
    throw new Error(
      `${result.name} rejected ${joinRejections} join rows; RSS candidates must not multiply sibling work`,
    )
  if (
    !/direct_candidate_rss_feed_items\s+AS\s+MATERIALIZED/i.test(result.query_text) ||
    !/SELECT\s+DISTINCT\s+ON\s*\(candidate\.story_id\)/i.test(result.query_text) ||
    nodes.some(node => node['Alias'] === 'better_rss_feed_item')
  ) {
    throw new Error(
      `${result.name} must materialize eligible direct candidates and select story winners once before pagination`,
    )
  }
}
