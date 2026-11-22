import { seedUuidAtTimestamp } from './common.mts'
import { loadCommentRows, type CommentRow } from './comment-descendant-partition-storage.mts'

export const ID_SERIAL_START = 8_800_000
export const BOUNDARY_PENDING_LEAF_COUNT = 500
const LARGE_THREAD_FAN_OUT = 3
const LARGE_THREAD_DEPTH = 8
const HOUR_MS = 60 * 60_000

/**
 * Load the wide tree one depth at a time. A level commits before the next, so its children find
 * their parents; inside a level each monthly leaf loads on its own connection.
 */
export async function loadWideCommentTree(input: {
  months: readonly number[]
  wideHeads: readonly CommentRow[]
  wideRootId: string
  hash: Buffer
  instant: string
}): Promise<{ wideBoundaryPathIds: string[] }> {
  const { months, wideHeads, wideRootId, hash, instant } = input
  let serial = ID_SERIAL_START + 10_000
  let parents: readonly CommentRow[] = wideHeads
  let wideBoundaryParentId: string | null = wideHeads[0]!.id
  const wideBoundaryPathIds = [wideHeads[0]!.id]
  for (let depth = 2; depth <= LARGE_THREAD_DEPTH; depth++) {
    const children: CommentRow[] = []
    for (const parent of parents) {
      const month = months[parent.monthIndex]!
      const timestamp = month + 2 * HOUR_MS + depth * 1_000
      for (let childIndex = 0; childIndex < LARGE_THREAD_FAN_OUT; childIndex++) {
        children.push({
          id: seedUuidAtTimestamp(timestamp, serial++),
          parentId: parent.id,
          rootId: wideRootId,
          monthIndex: parent.monthIndex,
          approved:
            depth === LARGE_THREAD_DEPTH || parent.id !== wideBoundaryParentId || childIndex !== 0,
        })
      }
    }
    const priorBoundaryParentId: string | null = wideBoundaryParentId
    const nextBoundaryChild: CommentRow | undefined = children.find(
      child => child.parentId === priorBoundaryParentId,
    )
    if (nextBoundaryChild) {
      wideBoundaryPathIds.push(nextBoundaryChild.id)
      wideBoundaryParentId = nextBoundaryChild.id
    }
    await loadCommentRows(children, hash, instant)
    parents = children
  }
  return { wideBoundaryPathIds }
}

/** The pending-leaf boundary thread in month 0: one chain of 8 nodes plus 500 pending leaves. */
export function buildBoundaryRows(input: {
  months: readonly number[]
  boundaryRootId: string
  boundaryHeadId: string
}): { boundaryRows: CommentRow[]; boundaryPathIds: string[]; boundaryPendingLeafIds: string[] } {
  const { months, boundaryRootId, boundaryHeadId } = input
  const boundaryRows: CommentRow[] = [
    {
      id: boundaryHeadId,
      parentId: boundaryRootId,
      rootId: boundaryRootId,
      monthIndex: 0,
      approved: false,
    },
  ]
  let boundaryParentId = boundaryHeadId
  const boundaryPathIds = [boundaryHeadId]
  for (let depth = 2; depth <= LARGE_THREAD_DEPTH; depth++) {
    const id = seedUuidAtTimestamp(
      months[0]! + 3 * HOUR_MS + depth * 1_000,
      ID_SERIAL_START + 3_000 + depth,
    )
    boundaryRows.push({
      id,
      parentId: boundaryParentId,
      rootId: boundaryRootId,
      monthIndex: 0,
      approved: depth === LARGE_THREAD_DEPTH,
    })
    boundaryPathIds.push(id)
    boundaryParentId = id
  }
  const boundaryPendingLeafIds = Array.from({ length: BOUNDARY_PENDING_LEAF_COUNT }, (_, index) =>
    seedUuidAtTimestamp(months[0]! + 3 * HOUR_MS + 7_500, ID_SERIAL_START + 4_000 + index),
  )
  boundaryRows.push(
    ...boundaryPendingLeafIds.map(id => ({
      id,
      parentId: boundaryPathIds[6]!,
      rootId: boundaryRootId,
      monthIndex: 0,
      approved: false,
    })),
  )
  return { boundaryRows, boundaryPathIds, boundaryPendingLeafIds }
}
