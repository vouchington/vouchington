import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuidAtTimestamp } from './common.mts'
import { captureFixtureInstant } from './parallel-fixture-load.mts'
import {
  addUtcMonths,
  createCommentPartitions,
  loadCommentRows,
  logCommentFixturePhase,
  nextUtcMonthStart,
  partitionName,
  type CommentRow,
} from './comment-descendant-partition-storage.mts'
import {
  ID_SERIAL_START,
  buildBoundaryRows,
  loadWideCommentTree,
} from './comment-descendant-partition-tree.mts'

const PARTITION_MONTHS = 24
const BACKGROUND_COMMENT_COUNT = 100_000
const LARGE_THREAD_HEAD_COUNT = 100
const HEAD_PAGE_ROOT_INDEX = 8_700_000
const LARGE_THREAD_ROOT_INDEX = 8_700_001
const BACKGROUND_ROOT_INDEX = 8_710_000
const BOUNDARY_ROOT_INDEX = 8_710_001
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
  console.log('Seeding partitioned comment descendant fixture')
  let phaseStartedAt = performance.now()
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
  const instant = await captureFixtureInstant()
  {
    await using transaction = await beginTransaction()
    await createCommentPartitions(transaction, months)
    await transaction.commit()
  }
  phaseStartedAt = logCommentFixturePhase('partitions', phaseStartedAt)
  const roots: CommentRow[] = [
    { id: rootId, parentId: null, rootId: null, monthIndex: 0 },
    { id: wideRootId, parentId: null, rootId: null, monthIndex: 0 },
    { id: boundaryRootId, parentId: null, rootId: null, monthIndex: 0 },
    ...backgroundRootIds.map((id, monthIndex): CommentRow => ({
      id,
      parentId: null,
      rootId: null,
      monthIndex,
    })),
  ]
  await loadCommentRows(roots, hash, instant)

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
  await loadCommentRows([...pageHeads, ...wideHeads], hash, instant)
  const { wideBoundaryPathIds } = await loadWideCommentTree({
    months,
    wideHeads,
    wideRootId,
    hash,
    instant,
  })
  const { boundaryRows, boundaryPathIds, boundaryPendingLeafIds } = buildBoundaryRows({
    months,
    boundaryRootId,
    boundaryHeadId,
  })
  await loadCommentRows(boundaryRows, hash, instant)
  phaseStartedAt = logCommentFixturePhase('wide tree and boundary rows', phaseStartedAt)
  let serial = ID_SERIAL_START + 2_000_000
  const backgroundRows: CommentRow[] = []
  for (let monthIndex = 0; monthIndex < PARTITION_MONTHS; monthIndex++) {
    const month = months[monthIndex]!
    let remaining =
      Math.floor(BACKGROUND_COMMENT_COUNT / PARTITION_MONTHS) +
      (monthIndex < BACKGROUND_COMMENT_COUNT % PARTITION_MONTHS ? 1 : 0)
    while (remaining > 0) {
      const batchCount = Math.min(remaining, INSERT_BATCH_SIZE)
      const root = backgroundRootIds[monthIndex]!
      backgroundRows.push(...backgroundCommentRows(month, root, serial, batchCount, monthIndex))
      serial += batchCount
      remaining -= batchCount
    }
  }
  await loadCommentRows(backgroundRows, hash, instant)
  logCommentFixturePhase('background rows', phaseStartedAt)
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

function backgroundCommentRows(
  at: number,
  root: string,
  from: number,
  count: number,
  monthIndex: number,
): CommentRow[] {
  const idAt = (i: number) => seedUuidAtTimestamp(at + 5 * 60 * 60_000, from + i)
  return Array.from({ length: count }, (_, i) => ({
    id: idAt(i),
    parentId: root,
    rootId: root,
    monthIndex,
  }))
}
