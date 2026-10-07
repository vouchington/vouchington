import { randomUUID } from 'node:crypto'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { BasicUser } from '@services/users/types'
import { requireActiveToolUser, requirePrivateToolUser } from './private-user.mts'

describe('requirePrivateToolUser', () => {
  it('hydrates from the primary user store to avoid replica-lag false negatives', async () => {
    const currentUser = await createTestUser()
    if (!currentUser) throw new Error('Failed to create test user')

    const privateUser = await requirePrivateToolUser(currentUser)

    expect(privateUser.id).toBe(currentUser.id)
    expect(privateUser.email_address).toBe(currentUser.email_address)
  })

  it('rejects missing hydrated users', async () => {
    const currentUser: BasicUser = {
      __entity_type: 'user',
      account_type: null,
      id: randomUUID(),
      roles: [],
    }

    await expect(requirePrivateToolUser(currentUser)).rejects.toMatchObject({ status: 401 })
  })
})

describe('requireActiveToolUser', () => {
  it('returns an active user and refuses a suspended one before any write', async () => {
    const currentUser = await createTestUser()

    expect((await requireActiveToolUser(currentUser)).id).toBe(currentUser.id)

    await suspendTestUser(currentUser.id)
    try {
      await expect(requireActiveToolUser(currentUser)).rejects.toMatchObject({
        status: 403,
        code: ACCOUNT_SUSPENDED,
      })
    } finally {
      await unsuspendTestUser(currentUser.id)
    }
  })
})
