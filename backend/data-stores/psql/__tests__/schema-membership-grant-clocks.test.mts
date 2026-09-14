import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import {
  createGrantClockTestSource,
  createGrantClockTestSourceState,
  createGrantDurationTestActivation,
  createGrantDurationTestGrant,
  getGrantClockTestProductId,
  getGrantDurationTestRemainingSeconds,
  insertParallelMembershipSourceStates,
  insertPreEffectiveMembershipSourceState,
} from '../../../test-helpers/data-stores/psql/membership-grant-clocks.mts'

describe('membership grant clock schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rejects source lifecycle timestamps before their effective clock or in parallel states', async () => {
    const userId = randomUUID()
    const productId = await getGrantClockTestProductId()
    const sourceId = await createGrantClockTestSource(userId)

    await expect(
      insertPreEffectiveMembershipSourceState(sourceId, productId),
    ).rejects.toMatchObject({ code: '23514' })

    await createGrantClockTestSourceState(sourceId, productId)
    await expect(insertParallelMembershipSourceStates(sourceId)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('subtracts persisted activation periods from a grant duration', async () => {
    const userId = randomUUID()
    const productId = await getGrantClockTestProductId()
    const sourceId = await createGrantClockTestSource(userId)
    const grantId = await createGrantDurationTestGrant(sourceId, userId, productId)
    await createGrantDurationTestActivation(grantId, userId)
    const remainingSeconds = await getGrantDurationTestRemainingSeconds(grantId)

    expect(remainingSeconds).toBe('604800')
  })
})
