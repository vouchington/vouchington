import type { ExplainResult } from '@data-stores/psql'
import { assertPaginationPlanShape } from './plan-pagination-gates.mts'
import { assertPostMetricsBatchIsCandidateBounded } from './plan-post-metrics-gate.mts'
import { assertPlanReturnedRows } from './plan-row-count-gate.mts'
import { assertSearchCommunitiesEligibilityIsIndexed } from './plan-search-communities-gate.mts'
import { assertTopicMetricsBatchIsCandidateBounded } from './plan-topic-metrics-gate.mts'
import { assertTopicViewerCountsDiscussionsUsesCandidateBind } from './plan-topic-viewer-counts-gate.mts'
import { assertTrendingCommunitiesIsCandidateBounded } from './plan-trending-communities-gate.mts'
import { assertUserRemovedPostsUsesIndex } from './plan-user-removed-posts-gate.mts'
import { assertCommittedAdmissionResponsePlanShapeIfApplicable } from './plan-admission-response-gate.mts'
import { assertTopicImportAttemptPlanShapeIfApplicable } from './plan-topic-import-attempts-gate.mts'
import { assertRemoteFollowerPagePlanShapeIfApplicable } from './plan-remote-followers-gate.mts'
import { assertReviewSuccessionCandidatePlanIfApplicable } from './plan-review-succession-gate.mts'

const UNIVERSAL_TOPIC_CANDIDATE_RELATIONS = new Set([
  'relation__post__category__topic',
  'post_review_topic_ratings',
  'post_data_point_topics',
])
const RSS_STATE_HISTORY_RELATIONS = new Set([
  'rss_feed_enablement_changes',
  'rss_feed_discoverability_changes',
])
const SINGLE_PARTITION_SCENARIOS = new Map([
  ['post-child-by-post', { key: 'post_id', parent: 'post_review_topic_ratings' }],
  ['crawl-chunks-by-crawl', { key: 'crawl_id', parent: 'crawl_chunks' }],
  ['conversation-messages', { key: 'conversation_id', parent: 'conversation_messages' }],
])
const MEMBERSHIP_REFUND_INDEXES_BY_SCENARIO = new Map([
  [
    'membership-refunds-already-refunded-batch',
    ['idx_mrefunds__stripe_charge_id', 'idx_mrefunds__stripe_payment_intent_id'],
  ],
])
type PlanNode = Record<string, unknown>

export function assertRequiredPlanShape(result: ExplainResult): void {
  assertPlanReturnedRows(result)
  const scenarioId = result.scenario_id
  if (scenarioId === 'post-search-universal-topic') assertUniversalTopicCandidatePlan(result)
  if (result.query_text.includes('view_rss_feed_current_states'))
    assertRssStateProjectionPlan(result)
  if (scenarioId === 'entity-relations-best' || scenarioId === 'entity-relations-newest') {
    assertRelationListingUsesIndexOrder(result)
  }
  const partitionScenario = scenarioId ? SINGLE_PARTITION_SCENARIOS.get(scenarioId) : undefined
  if (partitionScenario) assertSinglePartitionChild(result, partitionScenario)
  if (scenarioId === 'entity-relation-votes-by-target') assertEntityRelationVotePruning(result)
  const membershipRefundIndexes = scenarioId
    ? MEMBERSHIP_REFUND_INDEXES_BY_SCENARIO.get(scenarioId)
    : undefined
  if (membershipRefundIndexes) assertMembershipRefundUsesIndexes(result, membershipRefundIndexes)
  if (scenarioId === 'user-removed-posts-page') assertUserRemovedPostsUsesIndex(result)
  assertCommittedAdmissionResponsePlanShapeIfApplicable(result)
  assertRemoteFollowerPagePlanShapeIfApplicable(result)
  assertReviewSuccessionCandidatePlanIfApplicable(result)
  assertTopicImportAttemptPlanShapeIfApplicable(result)
  if (scenarioId === 'trending-communities') assertTrendingCommunitiesIsCandidateBounded(result)
  assertSearchCommunitiesEligibilityIsIndexed(result)
  assertPostMetricsBatchIsCandidateBounded(result)
  assertTopicMetricsBatchIsCandidateBounded(result)
  assertTopicViewerCountsDiscussionsUsesCandidateBind(result)
  assertPaginationPlanShape(result)
}

function assertMembershipRefundUsesIndexes(
  result: ExplainResult,
  requiredIndexes: readonly string[],
): void {
  const usedIndexNames = new Set(
    collectPlanNodes(result.plan)
      .map(node => node['Index Name'])
      .filter((name): name is string => typeof name === 'string'),
  )
  const missingIndexes = requiredIndexes.filter(index => !usedIndexNames.has(index))
  if (missingIndexes.length > 0) {
    throw new Error(
      `${result.name} (${result.scenario_id}) must use index(es) ${missingIndexes.join(', ')}`,
    )
  }
}

function assertSinglePartitionChild(
  result: ExplainResult,
  expected: { key: string; parent: string },
): void {
  const childNames = new Set(
    collectPlanNodes(result.plan)
      .map(node => String(node['Relation Name'] ?? ''))
      .filter(name => name.startsWith(`${expected.parent}__`)),
  )
  const hasPartitionKey = new RegExp(`\\b${expected.key}\\b`).test(result.query_text)
  if (!hasPartitionKey || childNames.size !== 1) {
    throw new Error(
      `${result.name} must constrain ${expected.parent}.${expected.key} and scan exactly one partition child`,
    )
  }
}

function assertEntityRelationVotePruning(result: ExplainResult): void {
  const voteChildren = new Set(
    collectPlanNodes(result.plan)
      .map(node => String(node['Relation Name'] ?? ''))
      .filter(name => /__votes__(?:default|p_\w+)$/.test(name)),
  )
  const hasBothKeys = ['relation_table', 'entity_relation_id'].every(key =>
    new RegExp(`\\b${key}\\b`).test(result.query_text),
  )
  const [onlyChild] = voteChildren
  if (
    !hasBothKeys ||
    voteChildren.size !== 1 ||
    !onlyChild?.startsWith('relation__post__category__topic__votes__')
  ) {
    throw new Error(
      `${result.name} must constrain relation_table and entity_relation_id to prune both partition levels`,
    )
  }
}

function assertUniversalTopicCandidatePlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const candidateAccess = nodes.some(node =>
    UNIVERSAL_TOPIC_CANDIDATE_RELATIONS.has(baseRelationName(node)),
  )
  const postAccesses = nodes.filter(
    node => baseRelationName(node) === 'posts' && node['Alias'] === 'posts',
  )
  const indexedPostIdLookup = postAccesses.some(
    node =>
      String(node['Node Type'] ?? '').includes('Index') &&
      String(node['Index Cond'] ?? '').includes('id'),
  )
  const scansPosts = postAccesses.some(node => node['Node Type'] === 'Seq Scan')

  if (!candidateAccess || !indexedPostIdLookup || scansPosts) {
    throw new Error(
      `${result.name} must drive universal-topic search from reverse-indexed candidates before indexed posts.id lookups`,
    )
  }
}

function assertRssStateProjectionPlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const historyAccess = nodes.find(node => RSS_STATE_HISTORY_RELATIONS.has(baseRelationName(node)))
  const lateralNode = nodes.find(node => String(node['Node Type'] ?? '').includes('Lateral'))
  if (historyAccess || lateralNode) {
    throw new Error(`${result.name} must read projected RSS state without lateral history scans`)
  }
}

function assertRelationListingUsesIndexOrder(result: ExplainResult): void {
  const sortNode = collectPlanNodes(result.plan).find(node =>
    String(node['Node Type'] ?? '').includes('Sort'),
  )
  if (sortNode) {
    throw new Error(`${result.name} must use relation index order without an explicit Sort`)
  }
}

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
