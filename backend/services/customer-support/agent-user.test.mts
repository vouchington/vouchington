import { describe, expect, it } from 'vitest'
import { assertCustomerSupportAgentUser, getCustomerSupportAgentUser } from './agent-user.mts'
import type { BasicUser } from '@services/users/types'

function makeUser(roles: readonly string[]): BasicUser {
  return {
    __entity_type: 'user',
    id: 'support-agent-1',
    username: 'customer-support',
    roles,
  }
}

describe('customer support agent user', () => {
  it('loads the seeded customer support system user', async () => {
    const user = await getCustomerSupportAgentUser()

    expect(user.username).toBe('customer-support')
    expect(user.roles).toContain('customer_support')
    expect(user.roles).not.toContain('administrator')
  })

  it('allows the customer_support role without administrator', () => {
    expect(() => assertCustomerSupportAgentUser(makeUser(['customer_support']))).not.toThrow()
  })

  it('rejects missing customer_support role', () => {
    expect(() => assertCustomerSupportAgentUser(makeUser([]))).toThrow(
      'System user @customer-support is missing customer_support role',
    )
  })

  it('rejects administrator privilege on the support agent user', () => {
    expect(() =>
      assertCustomerSupportAgentUser(makeUser(['customer_support', 'administrator'])),
    ).toThrow('System user @customer-support must not have administrator role')
  })

  it('rejects a missing support agent user', () => {
    expect(() => assertCustomerSupportAgentUser(null)).toThrow(
      'System user @customer-support not found',
    )
  })
})
