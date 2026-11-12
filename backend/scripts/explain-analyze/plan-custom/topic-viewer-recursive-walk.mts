import { baseRelationName, type PlanNode } from '../plan-nodes.mts'
import {
  topicViewerCte,
  topicViewerSourceCte,
  topicViewerSelect,
  topicViewerLateral,
  type TopicViewerSelect,
} from './topic-viewer-source-sql.mts'

export type TopicViewerRecursiveInput = {
  walk: string
  relation: string
  key: RegExp
  next: RegExp
}

export const VIEWER_INPUT_STREAMING_NODES = new Set([
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

export function validRecursiveWalk(
  node: PlanNode,
  input: TopicViewerRecursiveInput,
  queryText: string,
): boolean {
  if (!literalSeekLimits(queryText, input.walk)) return false
  const branches = topicViewerPlanChildren(node)
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
    if (!VIEWER_INPUT_STREAMING_NODES.has(type)) return false
    const bounded = seek || type === 'Limit'
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
    return topicViewerPlanChildren(part).every(child => visit(child, recursive, bounded))
  }
  return (
    visit(branches[0]!, false) &&
    visit(branches[1]!, true) &&
    firstScans > 0 &&
    nextScans > 0 &&
    counters === 1
  )
}

export function topicViewerPlanChildren(node: PlanNode): PlanNode[] {
  return Array.isArray(node.Plans)
    ? node.Plans.filter((child): child is PlanNode => child !== null && typeof child === 'object')
    : []
}

/** Verify the actual first/next LIMIT literals, independently of planner estimates. */
function literalSeekLimits(queryText: string, walk: string): boolean {
  const input = walk.replace('_key_walk', '_inputs')
  const outer = topicViewerSelect(topicViewerSourceCte(queryText, input)?.ctequery)
  const body = walk === 'viewer_alias_relation_key_walk' ? topicViewerLateral(outer) : outer
  const union = topicViewerSelect(topicViewerCte(body, walk)?.ctequery)
  if (union?.op !== 'SETOP_UNION' || !union.all) return false
  const first = union.larg
  const firstRange = first?.fromClause?.[0]
  const firstSeek = first?.limitCount
    ? first
    : firstRange && 'RangeSubselect' in firstRange
      ? topicViewerSelect(firstRange.RangeSubselect.subquery)
      : undefined
  const nextSeek = topicViewerLateral(union.rarg)
  return literalOne(firstSeek) && literalOne(nextSeek)
}

function literalOne(select: TopicViewerSelect | undefined): boolean {
  const limit = select?.limitCount
  return !!limit && 'A_Const' in limit && limit.A_Const.ival?.ival === 1 && !select?.limitOffset
}
