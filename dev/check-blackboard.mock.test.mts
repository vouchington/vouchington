import { afterEach, describe, expect, it, vi } from 'vitest'

const probeBlackboard =
  vi.fn<typeof import('vouchington-tooling/agent-blackboard').probeBlackboard>()

vi.mock<typeof import('vouchington-tooling/agent-blackboard')>(
  import('vouchington-tooling/agent-blackboard'),
  async importOriginal => {
    const actual = await importOriginal<typeof import('vouchington-tooling/agent-blackboard')>()
    // Defaults to the real probeBlackboard so the missing-URL/missing-token cases still exercise
    // resolveBlackboardConnection's real validation, which throws before any network call.
    probeBlackboard.mockImplementation(actual.probeBlackboard)
    return { ...actual, probeBlackboard }
  },
)

const { runCheckBlackboard } = await import('./check-blackboard.mts')

const HOSTED_ENV = {
  AGENT_BLACKBOARD_URL: 'https://example.invalid/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}

describe('runCheckBlackboard', () => {
  afterEach(() => {
    probeBlackboard.mockClear()
  })

  it('resolves when the bounded probe succeeds', async () => {
    probeBlackboard.mockResolvedValueOnce(undefined)
    await expect(runCheckBlackboard({ env: HOSTED_ENV })).resolves.toBeUndefined()
  })

  it('propagates a probe failure', async () => {
    probeBlackboard.mockRejectedValueOnce(
      new Error('agent-blackboard request failed: GET /sessions -> 500'),
    )

    await expect(runCheckBlackboard({ env: HOSTED_ENV })).rejects.toThrow(
      /sessions list probe failed.*-> 500/s,
    )
  })

  it('propagates a missing-URL failure', async () => {
    await expect(
      runCheckBlackboard({ env: { AGENT_BLACKBOARD_TOKEN: 'test-token' } }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_URL is not set/)
  })

  it('propagates a missing-token failure', async () => {
    await expect(
      runCheckBlackboard({ env: { AGENT_BLACKBOARD_URL: HOSTED_ENV.AGENT_BLACKBOARD_URL } }),
    ).rejects.toThrow(/AGENT_BLACKBOARD_TOKEN is not set/)
  })
})
