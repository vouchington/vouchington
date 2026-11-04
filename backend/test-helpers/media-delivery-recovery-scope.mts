import { expect } from 'vitest'
import { getTestMediaDeliveryRecordSnapshot } from './entities/media-delivery-retry.mts'
import {
  readTestAppliedMediaRegistryJobs,
  withTestMediaRecoveryBacklog,
} from './media-delivery-recovery.mts'

/** Create the excluded eligible record before capturing the owned page's upper UUID bound. */
type RecoveryScopeFixture = {
  recordIds: string[]
  scanBefore: string
  placements: Array<{ placementId: string; revision: number; imageId: string }>
  outsiderRecordId: string
}

export async function withTestMediaRecoveryBacklogWithOutsider<T>(
  userId: string,
  count: number,
  run: (fixture: RecoveryScopeFixture) => Promise<T>,
): Promise<T> {
  return withTestMediaRecoveryBacklog(userId, 1, async outsider => {
    const outsiderRecordId = outsider.recordIds[0]!
    return withTestMediaRecoveryBacklog(userId, count, async fixture => {
      const before = await getTestMediaDeliveryRecordSnapshot(outsiderRecordId)
      const result = await run({ ...fixture, outsiderRecordId })
      expect(await getTestMediaDeliveryRecordSnapshot(outsiderRecordId)).toEqual(before)
      expect(await readTestAppliedMediaRegistryJobs([outsiderRecordId])).toEqual([])
      return result
    })
  })
}

/** The outsider falls after the first owned cursor and before the remaining owned tuples. */
export async function withTestInterleavedMediaRecoveryBacklog<T>(
  userId: string,
  count: number,
  run: (fixture: RecoveryScopeFixture) => Promise<T>,
): Promise<T> {
  return withTestMediaRecoveryBacklog(userId, 1, first =>
    withTestMediaRecoveryBacklogWithOutsider(userId, count - 1, remaining =>
      run({
        ...remaining,
        recordIds: [...first.recordIds, ...remaining.recordIds].toSorted(),
        placements: [...first.placements, ...remaining.placements],
      }),
    ),
  )
}
