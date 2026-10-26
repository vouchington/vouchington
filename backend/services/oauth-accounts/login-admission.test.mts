import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  connectTestOAuthAccount,
  createTestUser,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import { lockLoginCredentialAdmission } from './login-admission.mts'

describe('provider first-factor admission', () => {
  it('admits only the exact currently linked provider subject under the user lock', async () => {
    const user = await createTestUser()
    const providerUserId = `github-${randomUUID()}`
    await insertTestOAuthAccount('github', providerUserId)
    await connectTestOAuthAccount('github', user.id, providerUserId)

    await using query = await beginTransaction()
    await expect(
      lockLoginCredentialAdmission(
        user.id,
        { type: 'provider', provider: 'github', providerUserId },
        query,
      ),
    ).resolves.toBeUndefined()
    await expect(
      lockLoginCredentialAdmission(
        user.id,
        { type: 'provider', provider: 'github', providerUserId: `other-${randomUUID()}` },
        query,
      ),
    ).rejects.toMatchObject({ status: 401 })
    await query.commit()
  })
})
