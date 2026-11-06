import { getVisibleCommentDescendantIdsPage } from '@services/comments'
import {
  getCommentDescendantMaxDepth,
  getCommentDescendantReadLimits,
  getCommentLookDownLimits,
} from '@services/comments/placeholder-config'
import {
  BOUNDARY_PENDING_LEAF_COUNT,
  type CommentDescendantPartitionFixture,
} from '../seed-data/comment-descendant-partition-fixture.mts'

/** Follow the same service from a returned boundary node through five empty head pages. */
export async function verifyWideBoundaryExpansion(
  fixture: CommentDescendantPartitionFixture,
): Promise<{
  boundaryId: string
  validReplyId: string
  lastPendingId: string
}> {
  const boundaryId = fixture.deepPathIds[6]
  const validReplyId = fixture.deepPathIds[7]
  if (!boundaryId || !validReplyId)
    throw new Error('The boundary fixture needs a returned depth-seven node and valid eighth reply')
  const readLimits = getCommentDescendantReadLimits()
  if (
    readLimits.maxHeads !== 100 ||
    getCommentDescendantMaxDepth() !== 7 ||
    getCommentLookDownLimits().maxRows !== 50 ||
    fixture.boundaryPendingLeafIds.length !== BOUNDARY_PENDING_LEAF_COUNT
  )
    throw new Error('The wide boundary fixture requires default 100-head, depth-seven, 50-row caps')

  const pending = fixture.boundaryPendingLeafIds.toSorted()
  let afterId: string | undefined
  for (let index = 0; index < 6; index++) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly six bounded production service pages prove empty-page continuation to the valid reply
    const page = await getVisibleCommentDescendantIdsPage(
      null,
      fixture.boundaryRootId,
      boundaryId,
      { limit: 100, afterId },
    )
    if (index < 5) {
      const expectedLast = pending[(index + 1) * 100 - 1]
      if (
        page.results.length !== 0 ||
        !page.hasNextPage ||
        page.lastInspectedHeadId !== expectedLast
      )
        throw new Error(`Wide boundary empty page ${index + 1} skipped a pending head`)
      afterId = page.lastInspectedHeadId
    } else if (page.results.length !== 1 || page.results[0] !== validReplyId || page.hasNextPage) {
      throw new Error('The sixth wide-boundary page must expose the valid eighth reply')
    }
  }
  return { boundaryId, validReplyId, lastPendingId: pending.at(-1)! }
}
