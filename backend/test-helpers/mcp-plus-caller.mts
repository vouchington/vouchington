import type { PrivateUser } from '../services/users/types.mts'
import { createTestMembership } from './entities/memberships.mts'
import { createTestUser } from './entities/users.mts'

/** A fresh user on the Plus plan, the minimum plan the user MCP write tools dispatch for. */
export async function createTestPlusMcpCaller(): Promise<
  PrivateUser & { membership_plan: 'plus' }
> {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan: 'plus' })
  return { ...user, membership_plan: 'plus' }
}
