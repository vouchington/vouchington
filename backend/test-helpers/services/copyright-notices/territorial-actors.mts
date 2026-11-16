import type { PrivateUser } from '../../../services/users/types.mts'
import { createRequest } from '../../api/server.mts'
import { createTerritorialUsers, type TerritorialUsers } from './territorial-routes.mts'

type TestAgent = ReturnType<typeof createRequest>

async function agentFor(user: PrivateUser): Promise<TestAgent> {
  const agent = createRequest()
  await agent.authenticateAs(user)
  return agent
}

export type TerritorialActors = TerritorialUsers & {
  anonymousRequest: TestAgent
  claimantRequest: TestAgent
  strangerRequest: TestAgent
  staffRequest: TestAgent
  administratorRequest: TestAgent
}

/** The territorial users, each with an authenticated API test client. Vitest only: importing this
 * starts the shared API test server, which a Playwright runner must never host. */
export async function createTerritorialActors(): Promise<TerritorialActors> {
  const users = await createTerritorialUsers()
  const [claimantRequest, strangerRequest, staffRequest, administratorRequest] = await Promise.all([
    agentFor(users.claimant),
    agentFor(users.stranger),
    agentFor(users.staff),
    agentFor(users.administrator),
  ])
  return {
    ...users,
    anonymousRequest: createRequest(),
    claimantRequest,
    strangerRequest,
    staffRequest,
    administratorRequest,
  }
}
