import { read } from '@data-stores/psql'
import { explainAnalyze } from '@data-stores/psql/explain-analyze'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import { assertRequiredPlanShape } from './plan-gates.mts'
import { registerScenarioContract, type ScenarioPlanContract } from './plan-expectations.mts'

const TRENDING_COMMUNITIES_BLIND_REFRESH_SCENARIO = 'mv-trending-communities-refresh-blind'

const VIEW = 'mv_trending_communities'

// Same ceilings the other refresh scenarios already use for posts and reviews.
// The member gate is new and only on this scenario. The blind seed read 30045.75
// member rows: sixty search communities of 500 members stay under LIMIT cap+1,
// plus the five small seed communities. 40000 still fails a sequential scan, which
// also reads the membership-cap community and the rest of the member seed.
const BLIND_CONTRACT: ScenarioPlanContract = {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'posts', max: 250_000 },
    { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 200_000 },
    { kind: 'maxProcessedRows', relation: 'community_members', max: 40_000 },
  ],
  crossPartition: { posts: 'The post id window defines the rolling trend window.' },
}

let registered = false

function registerTrendingCommunitiesBlindContract(): void {
  if (registered) return
  registerScenarioContract(TRENDING_COMMUNITIES_BLIND_REFRESH_SCENARIO, BLIND_CONTRACT)
  registered = true
}

async function readTrendingCommunitiesViewDefinition(): Promise<string> {
  const { rows } = await read<{ definition: string }>(
    `/* explainMaterializedViewDefinition */ SELECT pg_get_viewdef($1::regclass) AS definition`,
    [VIEW],
  )
  const definition = rows[0]?.definition
  if (!definition) throw new Error(`Missing materialized view ${VIEW}`)
  return definition
}

export async function captureTrendingCommunitiesBlindRefresh(
  runAndCapture: (scenarioId: string, execute: () => Promise<void>) => Promise<unknown>,
): Promise<void> {
  registerTrendingCommunitiesBlindContract()
  const definition = await readTrendingCommunitiesViewDefinition()
  await runAndCapture(TRENDING_COMMUNITIES_BLIND_REFRESH_SCENARIO, async () => {
    const result = await read(`/* ${TRENDING_COMMUNITIES_BLIND_REFRESH_SCENARIO} */ ${definition}`)
    if (result.rows.length === 0) throw new Error('Empty mv_trending_communities defining query')
  })
}

/** Explains and refreshes the view before ANALYZE, while planner statistics are still empty. */
export async function explainTrendingCommunitiesBeforeAnalyze(): Promise<void> {
  registerTrendingCommunitiesBlindContract()
  const definition = await readTrendingCommunitiesViewDefinition()
  const explained = await explainAnalyze(TRENDING_COMMUNITIES_BLIND_REFRESH_SCENARIO, definition)
  assertRequiredPlanShape({
    ...explained,
    scenario_id: TRENDING_COMMUNITIES_BLIND_REFRESH_SCENARIO,
  })
  await refreshMaterializedView(VIEW)
}
