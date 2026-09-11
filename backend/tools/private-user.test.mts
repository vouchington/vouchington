import { randomUUID } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import type { BasicUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'

describe('requirePrivateToolUser', () => {
  it('hydrates from the primary user store to avoid replica-lag false negatives', async () => {
    const currentUser = await createTestUser()
    if (!currentUser) throw new Error('Failed to create test user')

    const privateUser = await requirePrivateToolUser(currentUser)

    expect(privateUser.id).toBe(currentUser.id)
    expect(privateUser.email_address).toBe(currentUser.email_address)
  })

  it('rejects missing hydrated users', async () => {
    const currentUser: BasicUser = { __entity_type: 'user', id: randomUUID(), roles: [] }

    await expect(requirePrivateToolUser(currentUser)).rejects.toMatchObject({ status: 401 })
  })
})
