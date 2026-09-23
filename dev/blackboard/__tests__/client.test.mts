import { describe, expect, it } from 'vitest'

import { resolveBlackboardConnection } from '../client.mts'
import { HOSTED_ENV } from '../../test-helpers/blackboard/client-fixtures.mts'

describe('resolveBlackboardConnection', () => {
  it('points a missing AGENT_BLACKBOARD_URL at the setup docs', async () => {
    await expect(
      resolveBlackboardConnection({ env: { AGENT_BLACKBOARD_TOKEN: 'test-token' } }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_URL.*docs\/development\/agent-blackboard\.md/)
  })

  it('points a missing AGENT_BLACKBOARD_TOKEN at the setup docs', async () => {
    await expect(
      resolveBlackboardConnection({
        env: { AGENT_BLACKBOARD_URL: HOSTED_ENV.AGENT_BLACKBOARD_URL },
      }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_TOKEN.*docs\/development\/agent-blackboard\.md/)
  })

  it('returns the public client configuration', async () => {
    await expect(resolveBlackboardConnection({ env: HOSTED_ENV })).resolves.toMatchObject({
      baseUrl: HOSTED_ENV.AGENT_BLACKBOARD_URL,
      token: HOSTED_ENV.AGENT_BLACKBOARD_TOKEN,
    })
  })
})
