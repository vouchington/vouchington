import type { ExplainResult } from '@data-stores/psql'
import {
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
  POST_TOPIC_CATEGORY_RELATION_TABLE,
} from '@voucha/types/entities/entity-relation-tables'

const TOPIC_VIEWER_COUNTS_SCENARIOS = new Set(['topic-viewer-counts'])
const TOPIC_CANDIDATE_RELATIONS = new Set([
  POST_TOPIC_CATEGORY_RELATION_TABLE,
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
])

/**
 * `getTopicViewerCounts`'s `count__discussions` subquery is one of three sibling scalar
 * subqueries in a single `query_text` (`count__discussions`, `count__reviews`,
 * `count__data_points`), and all three alias their `posts` access `candidate_post` — the
 * reviews/data-points siblings join `post_review_topic_ratings`/`post_data_point_topics` instead
 * of the topic relation, so their `candidate_post` access never references `subject_id`. This must
 * police the discussions subquery without rejecting a correct plan because of those siblings.
 *
 * The discriminator is deliberately not "is `posts` indexed" — both the pre-fix correlated
 * `EXISTS (… UNION ALL …)` shape and the post-fix candidate-bind shape resolve `candidate_post`
 * through an `Index Scan`/`Bitmap Heap Scan` with a non-empty condition, so that check alone
 * accepts both. What differs is which side drives the join:
 *   - correlated-EXISTS (rejected): `candidate_post`'s condition is `post_type = 'discussion'` —
 *     posts is the outer/driving relation, with the topic-relation lookup re-run per row.
 *   - candidate-bind (accepted): `candidate_post`'s condition references the topic-relation's
 *     `subject_id` (e.g. `id = rel.subject_id`) — posts is probed from the topic side.
 * So the gate asserts at least one `candidate_post` access's effective condition text references
 * `subject_id` — existence, not universality, since the sibling subqueries' own `candidate_post`
 * accesses never will — and separately (defense against a future regression, not a discriminator
 * between the two shapes above — both already satisfy this) that the topic-relation access itself
 * is indexed.
 */
export function assertTopicViewerCountsDiscussionsUsesCandidateBind(result: ExplainResult): void {
  if (!result.scenario_id || !TOPIC_VIEWER_COUNTS_SCENARIOS.has(result.scenario_id)) return
  if (!result.query_text.includes('getTopicViewerCounts')) return

  const nodes = collectPlanNodes(result.plan)
  const candidatePostAccesses = nodes.filter(node => node['Alias'] === 'candidate_post')
  const drivenFromTopicSide = candidatePostAccesses.some(node =>
    getEffectiveConditionText(node).includes('subject_id'),
  )
  if (candidatePostAccesses.length === 0 || !drivenFromTopicSide) {
    throw new Error(
      `${result.name} (${result.scenario_id}) must drive count__discussions from the topic-side ` +
        'relation into posts, not filter posts by post_type and re-check topic membership per row',
    )
  }

  const relationAccesses = nodes.filter(node =>
    TOPIC_CANDIDATE_RELATIONS.has(baseRelationName(node)),
  )
  if (relationAccesses.length === 0 || relationAccesses.every(node => !hasIndexedAccess(node))) {
    throw new Error(
      `${result.name} (${result.scenario_id}) must resolve the topic-side candidate relation ` +
        'through an indexed lookup',
    )
  }
}

type PlanNode = Record<string, unknown>

function baseRelationName(node: PlanNode): string {
  return String(node['Relation Name'] ?? '').replace(/__(?:default|p_\w+)$/, '')
}

// Mirrors plan-topic-metrics-gate.mts's Bitmap Heap Scan handling: the `Index Cond` for a Bitmap
// Heap Scan lives on its child `Bitmap Index Scan`, not the node itself.
function hasIndexedAccess(node: PlanNode): boolean {
  if (String(node['Node Type'] ?? '') === 'Bitmap Heap Scan') {
    return collectPlanNodes(node).some(
      descendant =>
        descendant !== node &&
        String(descendant['Node Type'] ?? '') === 'Bitmap Index Scan' &&
        Boolean(String(descendant['Index Cond'] ?? '')),
    )
  }
  return Boolean(String(node['Index Cond'] ?? ''))
}

// The condition that determines what a node is joined/filtered on: `Index Cond` for a direct
// index lookup, `Filter` for a residual condition applied after the scan (e.g. a Seq Scan), and
// (for a Bitmap Heap Scan) its `Recheck Cond` plus any descendant `Bitmap Index Scan`'s
// `Index Cond`. Concatenated rather than picked one-at-a-time so a `subject_id` reference is
// found regardless of which of these properties the planner attached it to.
function getEffectiveConditionText(node: PlanNode): string {
  const parts = [node['Index Cond'], node['Recheck Cond'], node['Filter']]
    .filter(Boolean)
    .map(String)
  if (String(node['Node Type'] ?? '') === 'Bitmap Heap Scan') {
    for (const descendant of collectPlanNodes(node)) {
      if (
        descendant !== node &&
        String(descendant['Node Type'] ?? '') === 'Bitmap Index Scan' &&
        descendant['Index Cond']
      ) {
        parts.push(String(descendant['Index Cond']))
      }
    }
  }
  return parts.join(' ')
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
