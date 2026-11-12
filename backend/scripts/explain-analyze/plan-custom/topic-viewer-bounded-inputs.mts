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

const KEYED_PREFIX_INPUTS = [
  { cte: 'viewer_review_inputs', relation: 'post_review_topic_ratings' },
  { cte: 'viewer_data_point_inputs', relation: 'post_data_point_topics' },
] as const

function boundedKeyedPrefix(raw: PlanNode | undefined, relation: string, cap: number): boolean {
  if (!raw || raw['Node Type'] !== 'Limit' || Number(raw['Actual Loops']) !== 1) return false
  if (typeof raw['Actual Rows'] !== 'number' || raw['Actual Rows'] > cap) return false
  const descendants = collectPlanNodes(raw).slice(1)
  if (descendants.some(node => baseRelationName(node) === 'posts')) return false
  const scans = descendants.filter(node => baseRelationName(node) === relation)
  if (
    scans.length === 0 ||
    scans.some(
      node =>
        !['Index Scan', 'Index Only Scan'].includes(String(node['Node Type'])) ||
        typeof node['Index Cond'] !== 'string' ||
        !/\btopic_id\s*=/u.test(node['Index Cond']),
    )
  )
    return false
  if (
    descendants.some(
      node =>
        !['Index Scan', 'Index Only Scan', 'Append', 'Merge Append'].includes(
          String(node['Node Type']),
        ),
    )
  )
    return false
  return scans.reduce((total, scan) => total + processedRows(scan), 0) <= cap
}

/** Structural seek evidence complements the scenario's unchanged physical-row budgets. */
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
  const unboundedPrefixes = KEYED_PREFIX_INPUTS.filter(
    input =>
      !boundedKeyedPrefix(
        nodes.find(node => node['Subplan Name'] === `CTE ${input.cte}`),
        input.relation,
        inputCap,
      ),
  )
  if (unboundedPrefixes.length > 0)
    throw new Error(
      `${result.name} must bound keyed reads of topic viewer inputs: ${unboundedPrefixes.map(input => input.relation).join(', ')}`,
    )
}
