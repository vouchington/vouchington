import { describe, expect, it } from 'vitest'

import { resolveBlackboardConnection } from '../client.mts'
import { HOSTED_ENV } from '../test-helpers/client-fixtures.mts'

describe('resolveBlackboardConnection', () => {
  it('throws when AGENT_BLACKBOARD_URL is not set', async () => {
    await expect(
      resolveBlackboardConnection({ env: { AGENT_BLACKBOARD_TOKEN: 'test-token' } }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_URL is not set/)
  })

  it('throws when AGENT_BLACKBOARD_TOKEN is not set', async () => {
    await expect(
      resolveBlackboardConnection({
        env: { AGENT_BLACKBOARD_URL: HOSTED_ENV.AGENT_BLACKBOARD_URL },
      }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_TOKEN is not set/)
  })

  it('returns the public client configuration', async () => {
    await expect(resolveBlackboardConnection({ env: HOSTED_ENV })).resolves.toEqual({
      baseUrl: HOSTED_ENV.AGENT_BLACKBOARD_URL,
      token: HOSTED_ENV.AGENT_BLACKBOARD_TOKEN,
      readRetry: {},
    })
  })
})
