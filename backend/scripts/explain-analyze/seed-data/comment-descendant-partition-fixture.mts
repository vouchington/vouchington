import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuidAtTimestamp } from './common.mts'
import {
  addUtcMonths,
  insertCommentRows,
  nextUtcMonthStart,
  partitionName,
  type CommentRow,
} from './comment-descendant-partition-storage.mts'

const PARTITION_MONTHS = 24
const BACKGROUND_COMMENT_COUNT = 1_000_000
const LARGE_THREAD_HEAD_COUNT = 100
const LARGE_THREAD_FAN_OUT = 3
const LARGE_THREAD_DEPTH = 8
export const BOUNDARY_PENDING_LEAF_COUNT = 500
const HEAD_PAGE_ROOT_INDEX = 8_700_000
const LARGE_THREAD_ROOT_INDEX = 8_700_001
const BACKGROUND_ROOT_INDEX = 8_710_000
const BOUNDARY_ROOT_INDEX = 8_710_001
const ID_SERIAL_START = 8_800_000
const INSERT_BATCH_SIZE = 5_000

export interface CommentDescendantPartitionFixture {
  pageRootId: string
  pageHeadIds: string[]
  wideRootId: string
  wideHeadIds: string[]
  wideBoundaryPathIds: string[]
  boundaryRootId: string
  boundaryHeadId: string
  deepPathIds: string[]
  boundaryPendingLeafIds: string[]
  backgroundComments: number
  partitionNames: string[]
}

/**
 * Add a deterministic, explicitly partitioned comments corpus to the current EXPLAIN database.
 * This runs after ordinary scenarios: the monthly bounds start after the current UTC month, so
 * the existing DEFAULT partition has no rows to move and earlier plans keep their corpus.
 */
export async function seedCommentDescendantPartitionFixture(): Promise<CommentDescendantPartitionFixture> {
  const firstMonth = nextUtcMonthStart(Date.now())
  const months = Array.from({ length: PARTITION_MONTHS }, (_, index) =>
    addUtcMonths(firstMonth, index),
  )
  const partitionNames = months.map(partitionName)
  const rootId = seedUuidAtTimestamp(months[0]! + 1_000, HEAD_PAGE_ROOT_INDEX)
  const wideRootId = seedUuidAtTimestamp(months[0]! + 2_000, LARGE_THREAD_ROOT_INDEX)
  const boundaryRootId = seedUuidAtTimestamp(months[0]! + 3_000, BOUNDARY_ROOT_INDEX)
  const boundaryHeadId = seedUuidAtTimestamp(months[0]! + 3 * 60 * 60_000, ID_SERIAL_START + 3_000)
  const backgroundRootIds = months.map((month, index) =>
    seedUuidAtTimestamp(month + 4 * 60 * 60_000, BACKGROUND_ROOT_INDEX + index),
  )
  const pageHeadIds = Array.from({ length: 101 }, (_, index) =>
    seedUuidAtTimestamp(months[index % PARTITION_MONTHS]! + 60 * 60_000, ID_SERIAL_START + index),
  )
  const wideHeadIds = Array.from({ length: LARGE_THREAD_HEAD_COUNT }, (_, index) =>
    seedUuidAtTimestamp(
      months[index % PARTITION_MONTHS]! + 2 * 60 * 60_000,
      ID_SERIAL_START + 1_000 + index,
    ),
  )
  const hash = contentHash('comment-descendant-partition-fixture')
  await using transaction = await beginTransaction()
  for (let index = 0; index < months.length; index++) {
    const from = seedUuidAtTimestamp(months[index]!, 0)
    const to = seedUuidAtTimestamp(addUtcMonths(months[index]!, 1), 0)
    // no-mistakes-disable-next-line query-reached-per-item: create the fixed 24 monthly partitions in the isolated EXPLAIN database
    await transaction(
      `/* seedCommentDescendantPartition:partition */ CREATE TABLE IF NOT EXISTS ${partitionNames[index]} PARTITION OF posts
       FOR VALUES FROM ('${from}'::uuid) TO ('${to}'::uuid)`,
    )
  }
  const roots: CommentRow[] = [
    { id: rootId, parentId: null, rootId: null },
    { id: wideRootId, parentId: null, rootId: null },
    { id: boundaryRootId, parentId: null, rootId: null },
    ...backgroundRootIds.map((id): CommentRow => ({ id, parentId: null, rootId: null })),
  ]
  await insertCommentRows(transaction, roots, hash)

  const pageHeads = pageHeadIds.map((id, index) => ({
    id,
    parentId: rootId,
    rootId,
    monthIndex: index % PARTITION_MONTHS,
  }))
  const wideHeads = wideHeadIds.map((id, index) => ({
    id,
    parentId: wideRootId,
    rootId: wideRootId,
    monthIndex: index % PARTITION_MONTHS,
  }))
  await insertCommentRows(transaction, [...pageHeads, ...wideHeads], hash)
  let serial = ID_SERIAL_START + 10_000
  let parents: CommentRow[] = wideHeads
  let wideBoundaryParentId: string | null = wideHeadIds[0]!
  const wideBoundaryPathIds = [wideHeadIds[0]!]
  for (let depth = 2; depth <= LARGE_THREAD_DEPTH; depth++) {
    const children: CommentRow[] = []
    for (const parent of parents) {
      const month = months[parent.monthIndex ?? 0]!
      const timestamp = month + 2 * 60 * 60_000 + depth * 1_000
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
    // no-mistakes-disable-next-line query-reached-per-item: each depth frontier is inserted in bounded 5,000-row batches
    await insertCommentRows(transaction, children, hash)
    parents = children
  }
  const boundaryRows: CommentRow[] = [
    {
      id: boundaryHeadId,
      parentId: boundaryRootId,
      rootId: boundaryRootId,
      approved: false,
    },
  ]
  let boundaryParentId = boundaryHeadId
  const boundaryPathIds = [boundaryHeadId]
  for (let depth = 2; depth <= LARGE_THREAD_DEPTH; depth++) {
    const id = seedUuidAtTimestamp(
      months[0]! + 3 * 60 * 60_000 + depth * 1_000,
      ID_SERIAL_START + 3_000 + depth,
    )
    boundaryRows.push({
      id,
      parentId: boundaryParentId,
      rootId: boundaryRootId,
      approved: depth === LARGE_THREAD_DEPTH,
    })
    boundaryPathIds.push(id)
    boundaryParentId = id
  }
  const boundaryPendingLeafIds = Array.from({ length: BOUNDARY_PENDING_LEAF_COUNT }, (_, index) =>
    seedUuidAtTimestamp(months[0]! + 3 * 60 * 60_000 + 7_500, ID_SERIAL_START + 4_000 + index),
  )
  boundaryRows.push(
    ...boundaryPendingLeafIds.map(id => ({
      id,
      parentId: boundaryPathIds[6]!,
      rootId: boundaryRootId,
      approved: false,
    })),
  )
  await insertCommentRows(transaction, boundaryRows, hash)
  serial = ID_SERIAL_START + 2_000_000
  for (let monthIndex = 0; monthIndex < PARTITION_MONTHS; monthIndex++) {
    const month = months[monthIndex]!
    let remaining =
      Math.floor(BACKGROUND_COMMENT_COUNT / PARTITION_MONTHS) +
      (monthIndex < BACKGROUND_COMMENT_COUNT % PARTITION_MONTHS ? 1 : 0)
    while (remaining > 0) {
      const batchCount = Math.min(remaining, INSERT_BATCH_SIZE)
      const batchSerial = serial
      const rows = Array.from({ length: batchCount }, (_, index) => ({
        id: seedUuidAtTimestamp(month + 5 * 60 * 60_000, batchSerial + index),
        parentId: backgroundRootIds[monthIndex]!,
        rootId: backgroundRootIds[monthIndex]!,
      }))
      serial += batchCount
      // no-mistakes-disable-next-line query-reached-per-item: insert the million-row background corpus in bounded 5,000-row batches
      await insertCommentRows(transaction, rows, hash)
      remaining -= batchCount
    }
  }

  await transaction.commit()
  return {
    pageRootId: rootId,
    pageHeadIds,
    wideRootId,
    wideHeadIds,
    wideBoundaryPathIds,
    boundaryRootId,
    boundaryHeadId,
    deepPathIds: boundaryPathIds,
    boundaryPendingLeafIds,
    backgroundComments: BACKGROUND_COMMENT_COUNT,
    partitionNames,
  }
}
