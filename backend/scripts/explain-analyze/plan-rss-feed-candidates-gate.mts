import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'
import {
  HOSTNAME_COUNT,
  RSS_FEED_ITEM_SEED_COUNT,
  RSS_FEED_SEED_COUNT,
} from './seed-data/common.mts'

// Each item has at most ceil(feeds / hostnames) sources in the normal seed. Allow one pass
// for membership and one eligibility pass per direct/shared cohort, rather than work per sibling.
const SOURCE_PASS_CEILING =
  RSS_FEED_ITEM_SEED_COUNT * Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT)
const SOURCE_WORK_CEILING = SOURCE_PASS_CEILING * 3
const ITEM_WORK_CEILING = RSS_FEED_ITEM_SEED_COUNT * 2

export function assertRssFeedCandidatesAreSetBased(result: ExplainResult): void {
  if (!result.scenario_id?.startsWith('rss-feed-item-feed')) return
  const nodes = collectPlanNodes(result.plan)
  for (const [relation, ceiling] of [
    ['rss_feed_item_sources', SOURCE_WORK_CEILING],
    ['rss_feed_items', ITEM_WORK_CEILING],
  ] as const) {
    const work = nodes
      .filter(node => baseRelationName(node['Relation Name']) === relation)
      .reduce((total, node) => total + scannedRows(node), 0)
    if (work > ceiling)
      throw new Error(
        `${result.name} processed ${work} ${relation} rows; expected at most ${ceiling} for one membership pass and direct/shared eligibility`,
      )
  }
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

function scannedRows(node: Record<string, unknown>): number {
  return (
    (Number(node['Actual Rows'] ?? 0) +
      Number(node['Rows Removed by Filter'] ?? 0) +
      Number(node['Rows Removed by Index Recheck'] ?? 0)) *
    Number(node['Actual Loops'] ?? 1)
  )
}

function baseRelationName(value: unknown): string {
  return String(value ?? '').replace(/__(?:default|p_\w+)$|_default$/, '')
}
