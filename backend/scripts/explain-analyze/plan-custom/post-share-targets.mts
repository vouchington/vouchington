import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes, processedRows, type PlanNode } from '../plan-nodes.mts'
import {
  POST_SHARE_DENSE_TARGET_COUNT,
  POST_SHARE_SPARSE_TARGET_COUNT,
} from '../seed-data/post-feed-shares.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export function assertPostShareEligibilityIsTargetBounded(result: ExplainResult): void {
  const scenario = result.scenario_id
  if (!scenario?.startsWith('post-feed-shares-')) return
  const nodes = collectPlanNodes(result.plan)
  if (scenario.startsWith('post-feed-shares-disabled-')) {
    if (
      nodes.some(
        node =>
          stringFromUnknown(node['Relation Name'] ?? '').startsWith('post_feed_shares') ||
          stringFromUnknown(node['Subplan Name'] ?? '').startsWith('CTE shared_post') ||
          stringFromUnknown(node['Subplan Name'] ?? '') === 'CTE eligible_shared_posts',
      )
    )
      throw new Error(`${result.name} must omit disabled share CTEs and delivery branches`)
    return
  }
  const targetNode = nodes.find(node => node['Subplan Name'] === 'CTE shared_post_targets')
  const eligibilityNode = nodes.find(node => node['Subplan Name'] === 'CTE eligible_shared_posts')
  if (
    !targetNode ||
    !eligibilityNode ||
    targetNode['Node Type'] !== 'Aggregate' ||
    !Array.isArray(targetNode['Group Key']) ||
    targetNode['Group Key'].length !== 1 ||
    String(targetNode['Group Key'][0]).replace(/_\d+(?=\.)/, '') !==
      'shared_post_candidates.post_id'
  )
    throw new Error(`${result.name} must materialize distinct share targets before eligibility`)
  const targets = Number(targetNode['Actual Rows'] ?? 0) * Number(targetNode['Actual Loops'] ?? 0)
  const ceiling =
    scenario === 'post-feed-shares-empty'
      ? 0
      : scenario.includes('-sparse-')
        ? POST_SHARE_SPARSE_TARGET_COUNT
        : POST_SHARE_DENSE_TARGET_COUNT
  if (targets !== ceiling)
    throw new Error(`${result.name} must exercise exactly ${ceiling} distinct share targets`)
  const eligibilityNodes = collectPlanNodes(eligibilityNode)
  for (const alias of ['posts', 'root_post']) {
    assertIndexedTargetWork(result.name, eligibilityNodes, alias, targets)
  }
  assertShareDeliveryJoinWork(result.name, nodes, targets)
  const joinRejections = eligibilityNodes.reduce(
    (total, node) =>
      total + Number(node['Rows Removed by Join Filter'] ?? 0) * Number(node['Actual Loops'] ?? 0),
    0,
  )
  if (joinRejections > targets)
    throw new Error(
      `${result.name} rejected ${joinRejections} eligibility join rows for ${targets} distinct targets`,
    )
}

function assertShareDeliveryJoinWork(
  name: string,
  nodes: readonly PlanNode[],
  targets: number,
): void {
  const candidateNode = nodes.find(node => node['Subplan Name'] === 'CTE shared_post_candidates')
  const deliveries =
    Number(candidateNode?.['Actual Rows'] ?? 0) * Number(candidateNode?.['Actual Loops'] ?? 0)
  const spoolWork = nodes
    .filter(node => node['CTE Name'] === 'eligible_shared_posts')
    .reduce((total, node) => total + processedRows(node), 0)
  const rejected = nodes
    .filter(node =>
      stringFromUnknown(node['Join Filter'] ?? '').includes('eligible_shared_posts.id'),
    )
    .reduce(
      (total, node) =>
        total +
        Number(node['Rows Removed by Join Filter'] ?? 0) * Number(node['Actual Loops'] ?? 0),
      0,
    )
  if (spoolWork > targets + deliveries || rejected > targets + deliveries)
    throw new Error(
      `${name} rescanned ${spoolWork} eligible target rows and rejected ${rejected} delivery joins for ${targets} targets and ${deliveries} deliveries`,
    )
}

function assertIndexedTargetWork(
  name: string,
  nodes: readonly PlanNode[],
  alias: string,
  targets: number,
): void {
  const scans = nodes.filter(
    node =>
      stringFromUnknown(node['Alias'] ?? '').replace(/_\d+$/, '') === alias &&
      stringFromUnknown(node['Relation Name'] ?? '').startsWith('posts'),
  )
  const executingScans = scans.filter(node => Number(node['Actual Loops'] ?? 0) > 0)
  const work = scans.reduce((total, node) => total + processedRows(node), 0)
  const loops = scans.reduce((total, node) => total + Number(node['Actual Loops'] ?? 0), 0)
  if (work > targets || loops > targets)
    throw new Error(
      `${name} processed ${work} ${alias} rows in ${loops} probes for ${targets} distinct targets`,
    )
  if (
    executingScans.some(
      node =>
        !stringFromUnknown(node['Node Type'] ?? '').includes('Index') ||
        !stringFromUnknown(node['Index Cond'] ?? '').includes('(id = '),
    ) ||
    (targets > 0 && !executingScans.length)
  )
    throw new Error(`${name} must use indexed ${alias}.id probes for share targets`)
}
