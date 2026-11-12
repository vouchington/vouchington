import type { ExplainResult } from '@data-stores/psql'
import { getTopicsWorkLimit } from '@services/topics/work-limits'
import { baseRelationName, collectPlanNodes, processedRows, type PlanNode } from '../plan-nodes.mts'
import {
  validRecursiveWalk,
  topicViewerPlanChildren,
  VIEWER_INPUT_STREAMING_NODES,
} from './topic-viewer-recursive-walk.mts'

const INPUTS = [
  {
    cte: 'viewer_alias_inputs',
    walk: 'viewer_alias_key_walk',
    relation: 'topic_aliases',
    key: /\btopic_id\b/u,
    next: /\balias\s*>/u,
    limits: 1,
  },
  {
    cte: 'viewer_direct_inputs',
    walk: 'viewer_direct_key_walk',
    relation: 'relation__post__category__topic',
    key: /\bobject_id\b/u,
    next: /\bsubject_id\s*>/u,
    limits: 1,
  },
  {
    cte: 'viewer_alias_relation_inputs',
    walk: 'viewer_alias_relation_key_walk',
    relation: 'relation__post__category__topic_alias',
    key: /\bobject_id\b/u,
    next: /\bsubject_id\s*>/u,
    limits: 2,
  },
] as const

const RAW_PREFIX_INPUTS = [
  { cte: 'viewer_review_inputs', relation: 'post_review_topic_ratings' },
  { cte: 'viewer_data_point_inputs', relation: 'post_data_point_topics' },
] as const

function boundedRawPrefix(raw: PlanNode | undefined, relation: string, cap: number): boolean {
  if (!raw || raw['Node Type'] !== 'Limit' || Number(raw['Actual Loops']) !== 1) return false
  if (typeof raw['Actual Rows'] !== 'number' || raw['Actual Rows'] > cap) return false
  const descendants = collectPlanNodes(raw).slice(1)
  if (descendants.some(node => baseRelationName(node) && baseRelationName(node) !== relation))
    return false
  const scans = descendants.filter(node => baseRelationName(node) === relation)
  if (scans.length === 0) return false
  for (const scan of scans) {
    if (
      typeof scan['Actual Rows'] !== 'number' ||
      typeof scan['Actual Loops'] !== 'number' ||
      !Number.isFinite(processedRows(scan))
    )
      return false
    if (scan['Node Type'] === 'Seq Scan') {
      if (typeof scan.Filter !== 'string' || !/\btopic_id\s*=/u.test(scan.Filter)) return false
    } else {
      const index = typeof scan['Index Name'] === 'string' ? scan['Index Name'] : ''
      // A post_id-first PK can hide rejected topic keys inside Index Cond. Accept only the
      // canonical topic-leading indexes, whose matching prefix is visible in Actual Rows.
      const topicLeading =
        index === `idx_${relation}__topic_id` ||
        (index.startsWith(`${relation}__`) && index.includes('_topic_id_post_id'))
      if (
        !['Index Scan', 'Index Only Scan'].includes(String(scan['Node Type'])) ||
        !topicLeading ||
        typeof scan['Index Cond'] !== 'string' ||
        !/\btopic_id\s*=/u.test(scan['Index Cond'])
      )
        return false
    }
  }
  if (
    descendants.some(
      node =>
        !['Index Scan', 'Index Only Scan', 'Seq Scan', 'Append', 'Merge Append'].includes(
          String(node['Node Type']),
        ),
    )
  )
    return false
  // Bound physical work to a fixed multiple of the input cap, including discarded tuples
  // and every scan invocation across partitions, independently of the outer LIMIT output.
  return scans.reduce((total, scan) => total + processedRows(scan), 0) <= 2 * cap + 1
}

/** Structural seeks and raw-prefix work complement the scenario's physical-row budgets. */
export function assertTopicViewerInputsAreBounded(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const inputCap = getTopicsWorkLimit('viewer_count_input_cap')
  const missing = INPUTS.filter(input => {
    const raw = nodes.find(node => node['Subplan Name'] === `CTE ${input.cte}`)
    if (!raw || raw['Node Type'] !== 'Limit') return true
    // Actual Rows is per invocation, matching the raw input limit's scope.
    if (typeof raw['Actual Rows'] !== 'number' || raw['Actual Rows'] > inputCap) return true
    if (collectPlanNodes(raw).some(node => baseRelationName(node) === 'posts')) return true
    let walks = 0
    function visit(node: PlanNode, limits = 0, inLoop = false, localLimit = false): boolean {
      const type = node['Node Type']
      if (typeof type !== 'string') return false
      const depth = limits + Number(type === 'Limit')
      const local = type === 'Nested Loop' ? false : localLimit || (inLoop && type === 'Limit')
      if (type === 'Recursive Union') {
        walks += 1
        return (
          node['Subplan Name'] === `CTE ${input.walk}` &&
          depth >= input.limits &&
          (input.limits === 1 || local) &&
          validRecursiveWalk(node, input)
        )
      }
      if (!VIEWER_INPUT_STREAMING_NODES.has(type) || baseRelationName(node) === input.relation)
        return false
      return topicViewerPlanChildren(node).every(child =>
        visit(child, depth, inLoop || type === 'Nested Loop', local),
      )
    }
    return !visit(raw) || walks !== 1
  })
  if (missing.length > 0)
    throw new Error(
      `${result.name} must bound keyed reads of topic viewer inputs: ${missing.map(input => input.relation).join(', ')}`,
    )
  const unboundedPrefixes = RAW_PREFIX_INPUTS.filter(
    input =>
      !boundedRawPrefix(
        nodes.find(node => node['Subplan Name'] === `CTE ${input.cte}`),
        input.relation,
        inputCap,
      ),
  )
  if (unboundedPrefixes.length > 0)
    throw new Error(
      `${result.name} must bound raw reads of topic viewer inputs: ${unboundedPrefixes.map(input => input.relation).join(', ')}`,
    )
}
