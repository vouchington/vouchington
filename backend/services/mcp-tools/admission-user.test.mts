import { describe, expect, it } from 'vitest'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { getMcpAdmissionUser } from './admission-user.mts'

describe('getMcpAdmissionUser', () => {
  it('uses active suspension presence across multiple records and their lift', async () => {
    const user = await createTestUser()
    expect((await getMcpAdmissionUser(user.id))?.is_suspended).toBe(false)

    await suspendTestUser(user.id, 'first')
    await suspendTestUser(user.id, 'second')
    expect((await getMcpAdmissionUser(user.id))?.is_suspended).toBe(true)

    await unsuspendTestUser(user.id)
    expect((await getMcpAdmissionUser(user.id))?.is_suspended).toBe(false)
  })
})
