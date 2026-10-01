import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { withAbortedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-aborted-transaction'
import { lockActivePostAuthorImageAdmission } from './active-author.mts'

describe('post author storage admission', () => {
  it('preserves a real aborted-transaction failure instead of reporting an inactive author', async () => {
    const user = await createTestUser()
    await expect(
      withAbortedPostgresTransactionForTest(({ query }) =>
        lockActivePostAuthorImageAdmission(query, user.id, []),
      ),
    ).rejects.toMatchObject({ code: '25P02' })
  })
})
