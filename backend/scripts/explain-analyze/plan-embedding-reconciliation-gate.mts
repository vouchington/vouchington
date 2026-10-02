import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const FIRST_POST_INDEX = 'idx_posts__created_by_id__community_id__id'
const POST_CHILD_INDEX =
  /^posts(?:__(?:default|p_\w+)|_default)_created_by_id_community_id_id_idx$/u

function isRelation(node: Record<string, unknown>, parent: string): boolean {
  return (
    stringFromUnknown(node['Relation Name'] ?? '') === parent ||
    stringFromUnknown(node['Relation Name'] ?? '').startsWith(`${parent}__`) ||
    stringFromUnknown(node['Relation Name'] ?? '') === `${parent}_default`
  )
}

export function assertEmbeddingReconciliationPlanIfApplicable(result: ExplainResult): void {
  if (result.scenario_id === 'first-community-post-id-index') {
    assertFirstCommunityPostPlan(result)
  }
}

function assertFirstCommunityPostPlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const scans = nodes.filter(node => isRelation(node, 'posts'))
  if (
    !scans.some(
      node =>
        node['Index Name'] === FIRST_POST_INDEX ||
        POST_CHILD_INDEX.test(stringFromUnknown(node['Index Name'] ?? '')),
    ) ||
    scans.some(node => node['Node Type'] === 'Seq Scan') ||
    nodes.some(node => String(node['Node Type']).includes('Sort'))
  ) {
    throw new Error(
      `${result.name} must use ${FIRST_POST_INDEX} for the UUIDv7 first-post lookup without a sort or posts sequential scan`,
    )
  }
}
