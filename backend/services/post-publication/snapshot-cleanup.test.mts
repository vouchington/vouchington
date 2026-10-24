import {
  beginTransaction,
  enableQueryCapture,
  stopTestQueryCapture,
  type CapturedTestQuery,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { createTestPublicationSnapshotWork } from '@voucha/test-helpers/post-publication-fixtures'
import { insertTestPublicationSnapshotHeaderFanout } from '@voucha/test-helpers/entities/post-publication-query-plans'
import {
  getTestPublicationCleanupTraversalBound,
  lockTestPublicationSnapshots,
  readTestPublicationSnapshotIds,
} from '@voucha/test-helpers/entities/post-publication-cleanup'
import { cleanupPostPublicationIdentitySnapshots } from './snapshot-cleanup.mts'

describe('bounded publication snapshot cleanup', () => {
  it('bounds locked-header candidates and revisits skipped headers after wrap', async () => {
    const { work, candidate } = await createTestPublicationSnapshotWork()
    const ids = await insertTestPublicationSnapshotHeaderFanout({
      workId: work.id,
      generation: work.generation,
      postId: candidate.id,
      count: 3,
      abandoned: true,
    })
    await using lock = await beginTransaction()
    await lockTestPublicationSnapshots(lock, ids)
    const lockedBound = await getTestPublicationCleanupTraversalBound(2)
    for (let page = 0; page < lockedBound; page += 1) {
      const { result } = await captureCleanupCandidatePage()
      expect(result.scanned).toBeLessThanOrEqual(2)
      expect(result.snapshots).toBeLessThanOrEqual(2)
      expect(result.keys).toBeLessThanOrEqual(2)
    }
    expect(await readTestPublicationSnapshotIds(ids)).toEqual([...ids].toSorted())
    await lock.commit()
    const bound = await getTestPublicationCleanupTraversalBound(2)
    let remaining = ids
    for (let page = 0; page < bound && remaining.length > 0; page += 1) {
      await cleanupPostPublicationIdentitySnapshots(2)
      remaining = await readTestPublicationSnapshotIds(remaining)
    }
    expect(remaining).toEqual([])
  })
})

async function captureCleanupCandidatePage() {
  enableQueryCapture()
  let queries: CapturedTestQuery[] = []
  let result: Awaited<ReturnType<typeof cleanupPostPublicationIdentitySnapshots>>
  try {
    result = await cleanupPostPublicationIdentitySnapshots(2)
  } finally {
    queries = stopTestQueryCapture()
  }
  const page = queries.find(query =>
    query.text.startsWith('/* lockPublicationSnapshotCleanupHeaderPage */'),
  )?.values[0]
  if (!Array.isArray(page) || !page.every(value => typeof value === 'string'))
    throw new Error('Expected actual bounded cleanup candidate IDs')
  return { result, candidates: page as string[] }
}
