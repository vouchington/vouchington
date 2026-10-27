import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  softDeleteUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { BasicUser } from '@services/users/types'
import { getRequestCurrentUser, runWithRequestContext } from '@modules/utils/request-context'
import { requireActiveToolUser, requirePrivateToolUser } from './private-user.mts'

describe('requirePrivateToolUser', () => {
  it('rejects a user deleted after the basic identity was loaded but before first hydration', async () => {
    const authenticatedUser = await createTestUser()
    await softDeleteUser(authenticatedUser.id)
    await expect(requirePrivateToolUser(authenticatedUser)).rejects.toMatchObject({ status: 401 })
  })
  it('hydrates from the primary user store to avoid replica-lag false negatives', async () => {
    const currentUser = await createTestUser()
    if (!currentUser) throw new Error('Failed to create test user')

    const privateUser = await requirePrivateToolUser(currentUser)

    expect(privateUser.id).toBe(currentUser.id)
    expect(privateUser.email_address).toBe(currentUser.email_address)
  })

  it('reads the actor loaded earlier in the same tools/call', async () => {
    const currentUser = await createTestUser()
    await runWithRequestContext(async () => {
      const first = await requirePrivateToolUser(currentUser)
      const second = await requirePrivateToolUser(currentUser)
      expect(second).toBe(first)
    })
  })

  it('never restores an administrator role filtered by MCP bearer admission', async () => {
    const admin = await createTestUser({ administrator: true })
    const principal: BasicUser = {
      __entity_type: 'user',
      account_type: admin.account_type,
      id: admin.id,
      roles: admin.roles.filter(role => role !== 'administrator'),
    }
    await runWithRequestContext(async () => {
      const user = await requirePrivateToolUser(principal)
      expect(user.roles).not.toContain('administrator')
      expect(getRequestCurrentUser<{ roles: string[] }>()?.roles).not.toContain('administrator')
      expect((await requireActiveToolUser(principal)).roles).not.toContain('administrator')
    })
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
  it('rejects suspension committed after authentication before the first tool invocation', async () => {
    const authenticatedUser = await createTestUser()
    await suspendTestUser(authenticatedUser.id)
    try {
      await expect(requireActiveToolUser(authenticatedUser)).rejects.toMatchObject({
        status: 403,
        code: ACCOUNT_SUSPENDED,
      })
    } finally {
      await unsuspendTestUser(authenticatedUser.id)
    }
  })
  it('returns an active user and refuses a suspended one before any write', async () => {
    const currentUser = await createTestUser()

    const toolUser: BasicUser = {
      __entity_type: 'user',
      account_type: currentUser.account_type,
      id: currentUser.id,
      roles: currentUser.roles,
    }
    expect((await requireActiveToolUser(toolUser)).id).toBe(currentUser.id)

    await suspendTestUser(currentUser.id)
    try {
      await expect(requireActiveToolUser(toolUser)).rejects.toMatchObject({
        status: 403,
        code: ACCOUNT_SUSPENDED,
      })
    } finally {
      await unsuspendTestUser(currentUser.id)
    }
  })
})
