import type { QueryExecutor } from '@data-stores/psql'
import type { DirectPostEligibilityOptions } from '@modules/feed-query-builders'
import { loadCommentPreviewLevels, type HeadState } from './descendant-preview-levels.mts'
import { readBoundaryPlaceholderKeeps, type CommentCandidate } from './descendant-probe.mts'

/** Build all head previews with at most one child query per depth and one boundary look-down. */
export async function readCommentHeadPreviews(
  query: QueryExecutor,
  input: {
    heads: readonly CommentCandidate[]
    rootId: string
    currentUserId: string | null
    eligibility: DirectPostEligibilityOptions
    maxDepth: number
    maxChildrenPerHead: number
    maxRows: number
  },
): Promise<string[][]> {
  const { heads, rootId, eligibility } = input
  const states: HeadState[] = heads.map((head, headIndex) => ({
    nodes: [{ ...head, depth: 1, headIndex }],
    boundaries: new Set(),
    childRowsRead: 0,
  }))
  await loadCommentPreviewLevels(
    query,
    input,
    states,
    states.map(state => state.nodes[0]!),
    1,
    0,
  )
  const boundaryIds = states.flatMap(state =>
    state.nodes.flatMap(node => (!node.is_valid && state.boundaries.has(node.id) ? [node.id] : [])),
  )
  const boundaryKeeps = await readBoundaryPlaceholderKeeps(query, rootId, boundaryIds, eligibility)
  return states.map(state => {
    const byId = new Map(state.nodes.map(node => [node.id, node]))
    const kept = new Set(
      state.nodes.flatMap(node => (node.is_valid || boundaryKeeps.has(node.id) ? [node.id] : [])),
    )
    for (const id of [...kept]) {
      let parentId = byId.get(id)?.parent_post_id
      while (parentId && byId.has(parentId) && !kept.has(parentId)) {
        kept.add(parentId)
        parentId = byId.get(parentId)?.parent_post_id
      }
    }
    return [...kept].toSorted()
  })
}
