import { expect, it, describe } from 'vitest'
import { currentUserCanModifyFediverseInstanceIntegrationStatus } from './authorization.mts'
import type { PrivateUser } from '@services/users/types'

describe('authorization', () => {
  it('rejects a null current user', () => {
    expect(currentUserCanModifyFediverseInstanceIntegrationStatus(null)).toBe(false)
  })

  it('rejects a non-administrator current user', () => {
    const member = { username: 'member', roles: [] } as unknown as PrivateUser
    expect(currentUserCanModifyFediverseInstanceIntegrationStatus(member)).toBe(false)
  })

  it('allows administrators to modify fediverse instance integration status', () => {
    const admin = { username: 'admin', roles: ['administrator'] } as unknown as PrivateUser
    expect(currentUserCanModifyFediverseInstanceIntegrationStatus(admin)).toBe(true)
  })
})
