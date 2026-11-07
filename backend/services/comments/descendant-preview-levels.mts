import type { QueryExecutor } from '@data-stores/psql'
import type { DirectPostEligibilityOptions } from '@modules/feed-query-builders'
import {
  readCommentChildrenForFrontier,
  type CommentCandidate,
  type CommentFrontierParent,
} from './descendant-probe.mts'

export type PreviewNode = CommentCandidate & { depth: number; headIndex: number }
export type HeadState = {
  nodes: PreviewNode[]
  boundaries: Set<string>
  childRowsRead: number
}

type LevelLimits = {
  rootId: string
  currentUserId: string | null
  eligibility: DirectPostEligibilityOptions
  maxDepth: number
  maxChildrenPerHead: number
  maxRows: number
}

/** The next BFS level depends on the rows returned by this level's one set-based query. */
export async function loadCommentPreviewLevels(
  query: QueryExecutor,
  limits: LevelLimits,
  states: HeadState[],
  frontier: PreviewNode[],
  depth: number,
  childRowsRead: number,
): Promise<void> {
  if (frontier.length === 0) return
  const expandable: PreviewNode[] = []
  for (const node of frontier) {
    if (node.is_hidden || depth >= limits.maxDepth || childRowsRead >= limits.maxRows)
      states[node.headIndex]!.boundaries.add(node.id)
    else expandable.push(node)
  }
  if (expandable.length === 0) return
  const allocations = allocateFrontier(
    expandable,
    states,
    limits.maxChildrenPerHead,
    limits.maxRows - childRowsRead,
  )
  const allocated = allocations.filter(allocation => allocation.limit > 0)
  for (const allocation of allocations)
    if (allocation.limit === 0)
      states[allocation.parent.headIndex]!.boundaries.add(allocation.parent.id)
  if (allocated.length === 0) return
  const parents: CommentFrontierParent[] = allocated.map(({ parent, limit }) => ({
    id: parent.id,
    limit,
  }))
  const children = await readCommentChildrenForFrontier(query, {
    rootId: limits.rootId,
    parents,
    currentUserId: limits.currentUserId,
    eligibility: limits.eligibility,
  })
  const readPerParent = allocated.map(() => 0)
  const nextFrontier: PreviewNode[] = []
  for (const child of children) {
    const index = child.frontier_ordinal - 1
    const parent = allocated[index]!.parent
    const node: PreviewNode = {
      id: child.id,
      parent_post_id: child.parent_post_id,
      is_hidden: child.is_hidden,
      is_valid: child.is_valid,
      depth: parent.depth + 1,
      headIndex: parent.headIndex,
    }
    states[parent.headIndex]!.nodes.push(node)
    states[parent.headIndex]!.childRowsRead += 1
    readPerParent[index]! += 1
    nextFrontier.push(node)
  }
  for (const [index, allocation] of allocated.entries())
    if (readPerParent[index] === allocation.limit)
      states[allocation.parent.headIndex]!.boundaries.add(allocation.parent.id)
  return loadCommentPreviewLevels(
    query,
    limits,
    states,
    nextFrontier,
    depth + 1,
    childRowsRead + children.length,
  )
}

/** Assign no more raw child slots than the request and each head can spend. */
function allocateFrontier(
  frontier: readonly PreviewNode[],
  states: readonly HeadState[],
  maxChildrenPerHead: number,
  available: number,
): { parent: PreviewNode; limit: number }[] {
  const allocations = frontier.map(parent => ({ parent, limit: 0 }))
  const reservedPerHead = states.map(() => 0)
  let remaining = available
  // Round robin gives each expandable parent a bounded slice before earlier heads use more.
  // This can shorten a preview; opening its returned parent starts a fresh bounded window.
  while (remaining > 0) {
    let assigned = false
    for (const allocation of allocations) {
      const index = allocation.parent.headIndex
      if (states[index]!.childRowsRead + reservedPerHead[index]! >= maxChildrenPerHead) continue
      allocation.limit += 1
      reservedPerHead[index]! += 1
      remaining -= 1
      assigned = true
      if (remaining === 0) break
    }
    if (!assigned) break
  }
  return allocations
}
