import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

// getTrendingCommunities used to LEFT JOIN every public community against view_community_metrics,
// whose per-community correlated subqueries scanned before LIMIT — the O(all communities) shape
// that timed out backend CI. The fix derives candidates from windowed post activity first, capped by
// an explicit LIMIT, then joins communities only against that bounded set (see the service README).
// Losing that LIMIT is the regression, and it has to be caught at seed scale: this repo's dev/CI
// database is shared and growing (Ruling D), so comparing a communities scan's Actual Rows against
// the cap never fires once the seeded table is smaller than it — confirmed empirically by dropping
// the LIMIT and re-running this scenario, which left every downstream row count unchanged. The
// signal that survives seed scale is the plan shape itself: the candidates CTE's own subplan must be
// a Limit node, independent of how many rows there are to limit.
//
// Eligibility is inlined via buildPublicPostEligibilityFilter into candidate_reviewed_posts as two
// EXISTS-based SubPlans correlated to that CTE's own windowed post scan, not a join of communities
// against view_public_post_eligibility. Postgres inlines that NOT MATERIALIZED view at plan time, so
// its name never appears as a plan node even though the helper's generated SQL still names it in the
// query text — text presence of that view is not a meaningful signal, only its cost is.
export function assertTrendingCommunitiesIsCandidateBounded(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const candidatesCte = nodes.find(node => node['Subplan Name'] === 'CTE candidates')
  const communitiesAccesses = nodes.filter(node => baseRelationName(node) === 'communities')
  const referencesRemovedView = result.query_text.includes('view_community_metrics')
  if (
    candidatesCte?.['Node Type'] !== 'Limit' ||
    communitiesAccesses.length === 0 ||
    referencesRemovedView
  ) {
    throw new Error(
      `${result.name} must cap the candidates CTE with a LIMIT and scan communities only through ` +
        'that candidate set, without joining view_community_metrics',
    )
  }
}

type PlanNode = Record<string, unknown>

function baseRelationName(node: PlanNode): string {
  return stringFromUnknown(node['Relation Name'] ?? '').replace(/__(?:default|p_\w+)$/, '')
}
