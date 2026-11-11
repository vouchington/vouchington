import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes, type PlanNode } from '../plan-nodes.mts'

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
const STREAMING = new Set([
  'Limit',
  'Append',
  'Merge Append',
  'Nested Loop',
  'CTE Scan',
  'Result',
  'Memoize',
  'Subquery Scan',
  'Index Scan',
  'Index Only Scan',
])
type Input = (typeof INPUTS)[number]

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
      if (!STREAMING.has(type) || baseRelationName(node) === input.relation) return false
      return children(node).every(child =>
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

function validRecursiveWalk(node: PlanNode, input: Input): boolean {
  const branches = children(node)
  if (branches.length !== 2) return false
  let firstScans = 0
  let nextScans = 0
  let counters = 0
  function visit(part: PlanNode, recursive: boolean, seek = false): boolean {
    const type = part['Node Type']
    if (typeof type !== 'string') return false
    if (type === 'WorkTable Scan') {
      if (
        !recursive ||
        typeof part.Filter !== 'string' ||
        !/\binspected\s*<\s*(?:\$\d+|\d+)/u.test(part.Filter)
      )
        return false
      counters += 1
      return true
    }
    if (!STREAMING.has(type)) return false
    const bounded = seek || (type === 'Limit' && Number(part['Plan Rows']) === 1)
    if (baseRelationName(part) === input.relation) {
      if (
        !bounded ||
        !['Index Scan', 'Index Only Scan'].includes(type) ||
        typeof part['Index Name'] !== 'string' ||
        !part['Index Name'] ||
        typeof part['Index Cond'] !== 'string' ||
        !input.key.test(part['Index Cond']) ||
        (recursive && !input.next.test(part['Index Cond'])) ||
        Number(part['Actual Rows'] ?? 0) > 1
      )
        return false
      if (recursive) nextScans += 1
      else firstScans += 1
    }
    return children(part).every(child => visit(child, recursive, bounded))
  }
  return (
    visit(branches[0]!, false) &&
    visit(branches[1]!, true) &&
    firstScans > 0 &&
    nextScans > 0 &&
    counters === 1
  )
}

function children(node: PlanNode): PlanNode[] {
  return Array.isArray(node.Plans)
    ? node.Plans.filter((child): child is PlanNode => child !== null && typeof child === 'object')
    : []
}
