import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  getTestOAuthAccountRaw,
} from '@voucha/test-helpers'
import { deleteUserAndDrainForTest } from './delete-test-support.mts'

describe('sanitizeOAuthAccountPii (via deleteUser)', () => {
  it('completes successfully when user has no connected OAuth accounts', async () => {
    const user = await createTestUser()
    await expect(deleteUserAndDrainForTest(user, user)).resolves.not.toThrow()
  })

  it('nulls out email, data, and tokens for a connected Facebook account', async () => {
    const user = await createTestUser()
    const fbId = `fb-pii-test-${v7()}`
    await insertTestOAuthAccount('facebook', fbId, `tests+fb-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('facebook', user.id, fbId)

    await deleteUserAndDrainForTest(user, user)

    const account = await getTestOAuthAccountRaw('facebook', fbId)
    expect(account?.user_id).toBeNull()
    expect(account?.provider_user_email_address).toBeNull()
    expect(account?.provider_user_data).toEqual({})
  })

  it('nulls out tokens for a connected GitHub account', async () => {
    const user = await createTestUser()
    const ghId = `gh-pii-test-${v7()}`
    await insertTestOAuthAccount('github', ghId, `tests+gh-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('github', user.id, ghId)

    await deleteUserAndDrainForTest(user, user)

    const account = await getTestOAuthAccountRaw('github', ghId)
    expect(account?.user_id).toBeNull()
    expect(account?.provider_user_email_address).toBeNull()
    expect(account?.provider_user_data).toEqual({})
  })
})
