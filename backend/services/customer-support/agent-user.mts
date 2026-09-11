import { getPrivateUserByAny } from '@services/users'
import type { BasicUser } from '@services/users/types'

export const CUSTOMER_SUPPORT_AGENT_USERNAME = 'customer-support'
export const CUSTOMER_SUPPORT_AGENT_ROLE = 'customer_support'

export async function getCustomerSupportAgentUser(): Promise<BasicUser> {
  const user = await getPrivateUserByAny(CUSTOMER_SUPPORT_AGENT_USERNAME)
  assertCustomerSupportAgentUser(user)
  return user
}

export function assertCustomerSupportAgentUser(user: BasicUser | null): asserts user is BasicUser {
  if (!user) throw new Error(`System user @${CUSTOMER_SUPPORT_AGENT_USERNAME} not found`)
  if (!user.roles.includes(CUSTOMER_SUPPORT_AGENT_ROLE)) {
    throw new Error(
      `System user @${CUSTOMER_SUPPORT_AGENT_USERNAME} is missing ${CUSTOMER_SUPPORT_AGENT_ROLE} role`,
    )
  }
  if (user.roles.includes('administrator')) {
    throw new Error(
      `System user @${CUSTOMER_SUPPORT_AGENT_USERNAME} must not have administrator role`,
    )
  }
}
