import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes, processedRows } from '../plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const REMOTE_FOLLOWER_INDEX = 'idx_relation__remote_actor__follow__user__active_reverse'
const REMOTE_FOLLOWER_RELATION = 'relation__remote_actor__follow__user'
const REMOTE_ACTORS_RELATION = 'remote_actors'
const FEDIVERSE_DIRECTORY_RELATIONS = new Set(['topics', 'fediverse_instance_topics'])
const MAX_REMOTE_FOLLOWER_PAGE_ROWS = 501

export function assertRemoteFollowerPagePlanShapeIfApplicable(result: ExplainResult): void {
  if (result.scenario_id !== 'remote-follower-inbox-late-cursor') return
  const nodes = collectPlanNodes(result.plan)
  const indexNode = nodes.find(node => node['Index Name'] === REMOTE_FOLLOWER_INDEX)
  const indexCondition = stringFromUnknown(indexNode?.['Index Cond'] ?? '')
  const hasStrictKeysetCondition =
    indexCondition.includes('object_id') &&
    indexCondition.includes('subject_id') &&
    indexCondition.includes('>')
  const scansFollowerRelation = nodes.some(
    node => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === REMOTE_FOLLOWER_RELATION,
  )
  const hasLimit = nodes.some(node => node['Node Type'] === 'Limit')
  const actualRows = rootPlanNode(result.plan)?.['Actual Rows']
  const scansUnboundedRemoteActors = nodes.some(node => {
    if (node['Relation Name'] !== REMOTE_ACTORS_RELATION) return false
    return isNodeWorkUnbounded(node)
  })
  const scansUnboundedDirectory = nodes.some(
    node =>
      typeof node['Relation Name'] === 'string' &&
      FEDIVERSE_DIRECTORY_RELATIONS.has(node['Relation Name']) &&
      isNodeWorkUnbounded(node),
  )
  const sortsUnbounded = nodes.some(
    node =>
      stringFromUnknown(node['Node Type'] ?? '').includes('Sort') && isNodeWorkUnbounded(node),
  )

  if (
    !indexNode ||
    isNodeWorkUnbounded(indexNode) ||
    !hasStrictKeysetCondition ||
    scansFollowerRelation ||
    !hasLimit ||
    scansUnboundedRemoteActors ||
    scansUnboundedDirectory ||
    sortsUnbounded ||
    actualRows !== MAX_REMOTE_FOLLOWER_PAGE_ROWS
  ) {
    throw new Error(
      `${result.name} must return exactly ${MAX_REMOTE_FOLLOWER_PAGE_ROWS} rows through ${REMOTE_FOLLOWER_INDEX} with object_id and strict subject_id keyset conditions, without a follower relation sequential scan, unbounded sort, or unbounded remote_actors/topics/fediverse_instance_topics work`,
    )
  }
}

type PlanNode = Record<string, unknown>

function isNodeWorkUnbounded(node: PlanNode): boolean {
  const nodeRows = node['Actual Rows']
  const loops = node['Actual Loops']
  if (typeof nodeRows !== 'number' || typeof loops !== 'number') return true
  return processedRows(node) > MAX_REMOTE_FOLLOWER_PAGE_ROWS
}

function rootPlanNode(plan: unknown): PlanNode | undefined {
  if (plan == null || typeof plan !== 'object' || Array.isArray(plan)) return undefined
  const root = (plan as PlanNode)['Plan']
  if (root == null || typeof root !== 'object' || Array.isArray(root)) return undefined
  return root as PlanNode
}
