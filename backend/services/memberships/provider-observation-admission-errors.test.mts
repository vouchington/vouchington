import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { withAbortedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-aborted-transaction'
import { retainRejectedDirectObservation } from './provider-observation-projection-admission.mts'

describe('direct provider observation admission failures', () => {
  it('fails closed when source admission cannot read an aborted caller transaction', async () => {
    const user = await createTestUser()

    await expect(
      withAbortedPostgresTransactionForTest(({ query }) =>
        retainRejectedDirectObservation({
          userId: user.id,
          plan: 'plus',
          sourceIdentity: {
            provider: 'stripe',
            environment: 'test',
            applicationId: 'voucha-web',
            providerLineageId: `test-${randomUUID()}`,
          },
          enabled: true,
          query,
        }),
      ),
    ).rejects.toMatchObject({ code: '25P02' })
  })
})
