import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { withAbortedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-aborted-transaction'
import { lockDelegatedPostActor } from './delegated-actor-lock.mts'

describe('delegated actor lock database failures', () => {
  it('propagates an actual transaction fault without misclassifying the active author', async () => {
    const user = await createTestUser()
    await expect(
      withAbortedPostgresTransactionForTest(({ query }) => lockDelegatedPostActor(query, user.id)),
    ).rejects.toMatchObject({ code: '25P02' })
  })
})
