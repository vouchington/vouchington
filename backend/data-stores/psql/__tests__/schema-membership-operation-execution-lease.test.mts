import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import {
  claimMembershipOperationExecutionLease,
  createExecutionLeaseOperation,
  expireMembershipOperationExecutionLease,
} from '../../../test-helpers/data-stores/psql/membership-operation-leases.mts'

describe('membership operation execution leases', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('permits only an expired lease to rotate its execution token', async () => {
    const staleOperationId = await createExecutionLeaseOperation(`stale-lease-${randomUUID()}`)
    const activeOperationId = await createExecutionLeaseOperation(`active-lease-${randomUUID()}`)
    const staleToken = randomUUID()
    const activeToken = randomUUID()

    await claimMembershipOperationExecutionLease(staleOperationId, staleToken)
    await expireMembershipOperationExecutionLease(staleOperationId)
    await expect(
      claimMembershipOperationExecutionLease(staleOperationId, randomUUID()),
    ).resolves.toMatchObject({
      rowCount: 1,
    })

    await claimMembershipOperationExecutionLease(activeOperationId, activeToken)
    await expect(
      claimMembershipOperationExecutionLease(activeOperationId, randomUUID()),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringContaining(
        'membership operations only allow claimed provider execution lifecycle transitions',
      ),
    })
  })
})
