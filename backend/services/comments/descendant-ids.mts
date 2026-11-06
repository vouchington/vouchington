/* oxlint-disable no-await-in-loop -- each indexed probe depends on the remaining row budget and the prior parent frontier. */
import { beginTransaction, readPool } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import {
  readBoundaryPlaceholderKeeps,
  readCommentCandidates,
  type CommentCandidate,
} from './descendant-probe.mts'
import {
  getCommentDescendantMaxDepth,
  getCommentDescendantReadLimits,
} from './placeholder-config.mts'

type PreviewNode = CommentCandidate & { depth: number }

/**
 * Inspect one bounded page of direct-child heads, then preview a bounded number of descendants
 * below each kept head. The continuation key belongs to the last inspected head, even when that
 * head was filtered or its preview was shorter than the requested result limit. Opening any
 * returned comment starts the same bounded service from that comment.
 */
export async function getVisibleCommentDescendantIdsPage(
  currentUser: PrivateUser | null,
  rootId: string,
  startId: string,
  options: { limit: number; afterId?: string },
): Promise<{
  results: string[]
  hasNextPage: boolean
  firstInspectedHeadId: string | null
  lastInspectedHeadId: string | null
}> {
  if (!isUUID(rootId)) throw createError(422, 'Invalid rootId')
  if (!isUUID(startId)) throw createError(422, 'Invalid startId')
  if (options.afterId && !isUUID(options.afterId)) throw createError(422, 'Invalid cursor')

  const eligibility = {
    currentUserId: currentUser?.id ?? null,
    isModerationStaff: isModerationStaff(currentUser),
  }
  const limits = getCommentDescendantReadLimits()
  const maxDepth = getCommentDescendantMaxDepth()
  const headLimit = Math.min(options.limit, limits.maxHeads)
  await using transaction = await beginTransaction({ client: readPool })
  await transaction(sql`/* getVisibleCommentDescendantIdsPage:transaction */
    SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`)
  const heads = await readCommentCandidates(transaction, {
    rootId,
    parentId: startId,
    limit: headLimit + 1,
    afterId: options.afterId,
    checkRoot: true,
    currentUserId: currentUser?.id ?? null,
    eligibility,
  })

  const results: string[] = []
  let inspectedHeads = 0
  let childRowsRead = 0
  for (const head of heads.slice(0, headLimit)) {
    // no-mistakes-disable-next-line query-reached-per-item: the runtime head cap bounds probes, and each preview spends the remaining per-head and total child-row budgets.
    const preview = await readHeadPreview({
      head,
      rootId,
      currentUserId: currentUser?.id ?? null,
      eligibility,
      maxDepth,
      maxChildren: Math.min(limits.maxChildrenPerHead, limits.maxRows - childRowsRead),
      query: transaction,
    })
    childRowsRead += preview.childRowsRead
    inspectedHeads += 1
    results.push(...preview.ids.slice(0, options.limit - results.length))
    if (results.length >= options.limit || childRowsRead >= limits.maxRows) break
  }
  await transaction.commit()
  return {
    results: results.toSorted(),
    hasNextPage: inspectedHeads < heads.length,
    firstInspectedHeadId: inspectedHeads > 0 ? heads[0]!.id : null,
    lastInspectedHeadId: heads[inspectedHeads - 1]?.id ?? null,
  }
}

async function readHeadPreview(input: {
  head: CommentCandidate
  rootId: string
  currentUserId: string | null
  eligibility: { currentUserId: string | null; isModerationStaff: boolean }
  maxDepth: number
  maxChildren: number
  query: Parameters<typeof readCommentCandidates>[0]
}): Promise<{ ids: string[]; childRowsRead: number }> {
  const { head, rootId, currentUserId, eligibility, maxDepth, maxChildren, query } = input
  const nodes: PreviewNode[] = [{ ...head, depth: 1 }]
  const boundaries = new Set<string>()
  let nextParent = 0
  let childRowsRead = 0
  // Each probe uses the parent/id index and a remaining-row LIMIT. A truncated parent's own
  // permalink restarts this service, so no uninspected child needs a continuation here.
  while (nextParent < nodes.length) {
    const parent = nodes[nextParent++]!
    if (parent.is_hidden || parent.depth >= maxDepth || childRowsRead >= maxChildren) {
      boundaries.add(parent.id)
      continue
    }
    const remaining = maxChildren - childRowsRead
    // no-mistakes-disable-next-line query-reached-per-item: each dependent parent/id probe uses LIMIT remaining from the configured per-head and total child-row budgets.
    const children = await readCommentCandidates(query, {
      rootId,
      parentId: parent.id,
      limit: remaining,
      checkRoot: false,
      currentUserId,
      eligibility,
    })
    childRowsRead += children.length
    if (children.length === remaining) boundaries.add(parent.id)
    for (const child of children) nodes.push({ ...child, depth: parent.depth + 1 })
  }
  const boundaryPlaceholders: string[] = []
  const byId = new Map<string, PreviewNode>()
  const kept = new Set<string>()
  for (const node of nodes) {
    byId.set(node.id, node)
    if (node.is_valid) kept.add(node.id)
    else if (boundaries.has(node.id)) boundaryPlaceholders.push(node.id)
  }
  const boundaryKeeps = await readBoundaryPlaceholderKeeps(
    query,
    rootId,
    boundaryPlaceholders,
    eligibility,
  )
  for (const id of boundaryKeeps) kept.add(id)
  for (const id of [...kept]) {
    let parentId = byId.get(id)?.parent_post_id
    while (parentId && byId.has(parentId) && !kept.has(parentId)) {
      kept.add(parentId)
      parentId = byId.get(parentId)?.parent_post_id
    }
  }
  return { ids: [...kept].toSorted(), childRowsRead }
}
