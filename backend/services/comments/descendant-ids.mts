import { beginTransaction, readPool } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { readCommentHeadPreviews } from './descendant-preview.mts'
import { readCommentHeads } from './descendant-probe.mts'
import {
  getCommentDescendantMaxDepth,
  getCommentDescendantReadLimits,
} from './placeholder-config.mts'

/**
 * Inspect one bounded page of direct-child heads, then preview their descendants in one query
 * per breadth-first depth. The continuation key belongs to the last inspected head, even when
 * that head was filtered or its preview was shorter than the requested result limit. Opening a
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
  // ast-grep-ignore: no-three-sequential-awaits -- the read-only snapshot precedes root and head checks, whose result defines the dependent bounded preview frontier.
  await transaction(sql`/* getVisibleCommentDescendantIdsPage:transaction */
    SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`)
  const heads = await readCommentHeads(transaction, {
    rootId,
    parentId: startId,
    limit: headLimit + 1,
    afterId: options.afterId,
    currentUserId: currentUser?.id ?? null,
    eligibility,
  })
  const previews = await readCommentHeadPreviews(transaction, {
    heads: heads.slice(0, headLimit),
    rootId,
    currentUserId: currentUser?.id ?? null,
    eligibility,
    maxDepth,
    maxChildrenPerHead: limits.maxChildrenPerHead,
    maxRows: limits.maxRows,
  })
  const results: string[] = []
  let inspectedHeads = 0
  for (const preview of previews) {
    inspectedHeads += 1
    results.push(...preview.slice(0, options.limit - results.length))
    if (results.length >= options.limit) break
  }
  await transaction.commit()
  return {
    results: results.toSorted(),
    hasNextPage: inspectedHeads < heads.length,
    firstInspectedHeadId: inspectedHeads > 0 ? heads[0]!.id : null,
    lastInspectedHeadId: heads[inspectedHeads - 1]?.id ?? null,
  }
}
