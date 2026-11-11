import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes, type PlanNode } from '../plan-nodes.mts'
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

/** Structural seek evidence complements the scenario's unchanged physical-row budgets. */
export function assertTopicViewerInputsAreBounded(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const missing = INPUTS.filter(input => {
    const raw = nodes.find(node => node['Subplan Name'] === `CTE ${input.cte}`)
    if (!raw || raw['Node Type'] !== 'Limit') return true
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
}
