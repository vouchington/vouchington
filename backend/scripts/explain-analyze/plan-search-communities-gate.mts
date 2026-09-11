import type { ExplainResult } from '@data-stores/psql'

// searchCommunities() (and the single-community getCommunityMetrics() read) used to pay for
// view_community_metrics.post_count by re-scanning the whole posts table once per candidate
// community: view_public_post_eligibility was a top-level `WITH eligible_root_posts AS NOT
// MATERIALIZED (...)` plus two UNION ALL branches, and a subquery carrying a non-empty cteList
// fails is_simple_subquery()/is_simple_union_all() in the planner, so PostgreSQL could not pull
// the view up into the enclosing query. `eligibility.post_id = p.id` was then a join qual between
// two relations rather than a restriction pushable into a subquery RTE, so the whole eligibility
// computation re-executed per candidate post. Captured before-plan for this scenario: the CTE's
// `root_post`/`candidate_post` posts accesses carried no `Index Cond` at all (an unconstrained,
// per-loop Index Scan returning ~99999 rows every time), while every other posts access in the
// same plan did carry one (see #10785).
//
// The fix flattens the view to a single CTE-free, UNION-free SELECT so it pulls up, which turns
// every posts access correlated to a candidate/root post into an ordinary parameterized index
// lookup. Row-count and wall-time assertions are inert here for the same reason
// plan-trending-communities-gate.mts rejects them: this repo's dev/CI database is shared and
// growing, so a fixed row-count/timing threshold stops meaning anything once the seed outgrows
// it. The signal that survives seed scale is plan shape: every `posts` base-relation access must
// carry a non-empty `Index Cond`. A regressed plan instead shows a `posts` node with no
// `Index Cond` — a Seq Scan, or an unconstrained per-loop Index Scan — which is a structural fact
// about the plan, not a number that decays as the seed grows.
const SEARCH_COMMUNITIES_SCENARIOS = new Set([
  'search-communities',
  'search-communities-has-list-items',
  'search-communities-member',
  'search-communities-text',
  'search-communities-virtual-subscriptions',
])

export function assertSearchCommunitiesEligibilityIsIndexed(result: ExplainResult): void {
  if (!result.scenario_id || !SEARCH_COMMUNITIES_SCENARIOS.has(result.scenario_id)) return
  // A scenario can capture more than one query; this gate only concerns the metrics join.
  if (!result.query_text.includes('view_community_metrics')) return

  const postsAccesses = collectPlanNodes(result.plan).filter(
    node => baseRelationName(node) === 'posts',
  )
  const hasUnindexedAccess = postsAccesses.some(node => !String(node['Index Cond'] ?? ''))
  if (postsAccesses.length === 0 || hasUnindexedAccess) {
    throw new Error(
      `${result.name} (${result.scenario_id}) must resolve view_community_metrics.post_count ` +
        'through indexed posts lookups, not a per-candidate rescan',
    )
  }
}

type PlanNode = Record<string, unknown>

function baseRelationName(node: PlanNode): string {
  return String(node['Relation Name'] ?? '').replace(/__(?:default|p_\w+)$/, '')
}

function collectPlanNodes(value: unknown, nodes: PlanNode[] = []): PlanNode[] {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return nodes
  const node = value as PlanNode
  if (typeof node['Node Type'] === 'string') nodes.push(node)
  const plans = node['Plans']
  if (Array.isArray(plans)) {
    for (const child of plans) collectPlanNodes(child, nodes)
  }
  collectPlanNodes(node['Plan'], nodes)
  return nodes
}
