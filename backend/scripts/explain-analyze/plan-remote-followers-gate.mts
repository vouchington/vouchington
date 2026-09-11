import type { ExplainResult } from '@data-stores/psql'

const REMOTE_FOLLOWER_INDEX = 'idx_relation__remote_actor__follow__user__active_reverse'
const REMOTE_FOLLOWER_RELATION = 'relation__remote_actor__follow__user'
const REMOTE_ACTORS_RELATION = 'remote_actors'
const FEDIVERSE_DIRECTORY_RELATIONS = new Set(['topics', 'topics__fediverse_instances'])
const MAX_REMOTE_FOLLOWER_PAGE_ROWS = 501

export function assertRemoteFollowerPagePlanShapeIfApplicable(result: ExplainResult): void {
  if (result.scenario_id !== 'remote-follower-inbox-late-cursor') return
  const nodes = collectPlanNodes(result.plan)
  const indexNode = nodes.find(node => node['Index Name'] === REMOTE_FOLLOWER_INDEX)
  const indexCondition = String(indexNode?.['Index Cond'] ?? '')
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
    node => String(node['Node Type'] ?? '').includes('Sort') && isNodeWorkUnbounded(node),
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
      `${result.name} must return exactly ${MAX_REMOTE_FOLLOWER_PAGE_ROWS} rows through ${REMOTE_FOLLOWER_INDEX} with object_id and strict subject_id keyset conditions, without a follower relation sequential scan, unbounded sort, or unbounded remote_actors/topics/topics__fediverse_instances work`,
    )
  }
}

type PlanNode = Record<string, unknown>

function isNodeWorkUnbounded(node: PlanNode): boolean {
  const nodeRows = node['Actual Rows']
  const loops = node['Actual Loops']
  if (typeof nodeRows !== 'number' || typeof loops !== 'number') return true
  const removedRows = ['Rows Removed by Filter', 'Rows Removed by Index Recheck'].reduce(
    (total, key) => total + (typeof node[key] === 'number' ? node[key] : 0),
    0,
  )
  return (nodeRows + removedRows) * loops > MAX_REMOTE_FOLLOWER_PAGE_ROWS
}

function rootPlanNode(plan: unknown): PlanNode | undefined {
  if (plan == null || typeof plan !== 'object' || Array.isArray(plan)) return undefined
  const root = (plan as PlanNode)['Plan']
  if (root == null || typeof root !== 'object' || Array.isArray(root)) return undefined
  return root as PlanNode
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
