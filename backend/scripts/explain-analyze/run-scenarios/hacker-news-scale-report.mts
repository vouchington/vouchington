import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'
import { getResults, OUTPUT_DIR } from '../run-support.mts'
import type { HackerNewsScaleFixture } from '../seed-data/hacker-news-scale-fixture.mts'

export function hackerNewsPlanWork(result: ExplainResult) {
  const nodes = collectPlanNodes(result.plan)
  const root = nodes[0] ?? {}
  const rowsByRelation: Record<string, number> = {}
  for (const node of nodes) {
    if (typeof node['Relation Name'] !== 'string') continue
    const relation = baseRelationName(node)
    rowsByRelation[relation] = (rowsByRelation[relation] ?? 0) + processedRows(node)
  }
  return {
    scenario: result.scenario_id,
    name: result.name,
    mode: result.plan_cache_mode,
    sharedHitBlocks: Number(root['Shared Hit Blocks'] ?? 0),
    sharedReadBlocks: Number(root['Shared Read Blocks'] ?? 0),
    returnedRows: Number(root['Actual Rows'] ?? 0),
    rowsByRelation,
    bitmapRows: nodes
      .filter(node => node['Node Type'] === 'Bitmap Index Scan')
      .reduce((sum, node) => sum + processedRows(node), 0),
    indexes: [
      ...new Set(
        nodes.flatMap(node => (typeof node['Index Name'] === 'string' ? [node['Index Name']] : [])),
      ),
    ],
    executedPostLeaves: [
      ...new Set(
        nodes
          .filter(
            node => baseRelationName(node) === 'posts' && Number(node['Actual Loops'] ?? 0) > 0,
          )
          .map(node => node['Relation Name']),
      ),
    ],
  }
}

/** Historical comparisons stay diagnostic: they must not weaken or add exceptions to live gates. */
export function writeHackerNewsScaleReport(
  fixture: HackerNewsScaleFixture,
  observations: readonly unknown[],
  referencePlans: readonly ExplainResult[],
): void {
  const current = getResults().filter(result =>
    result.scenario_id?.startsWith('hacker-news-scale-'),
  )
  const report = {
    corpusPosts: fixture.postCount,
    partitionNames: fixture.partitions.map(partition => partition.name),
    simulatedDecisionInstant: fixture.decisionInstant.toISOString(),
    clockNote:
      'Future owned ranges avoid changing ordinary fixtures. JS query cutoffs use the recorded decision instant; SQL NOW stays at wall clock, so the existing future-post hot-score guard applies.',
    cacheNote:
      'Cold PostgreSQL shared buffers after relation/index eviction; warm is immediate same-mode replay. OS and storage caches remain uncontrolled. No global cache eviction or server restart. A nonzero skipped count is recorded on the eviction observation and does not fail the shard.',
    historicalNote:
      'Canonical-URL join predicate under current pagination/hot cohort policy; diagnostic only, never application code or a gate exception.',
    observations,
    current: current.map(hackerNewsPlanWork),
    reference: referencePlans.map(result => ({
      work: hackerNewsPlanWork(result),
      plan: result.plan,
      sql: result.query_text,
    })),
  }
  writeFileSync(join(OUTPUT_DIR, 'hacker-news-scale.json'), JSON.stringify(report, null, 2))
}
