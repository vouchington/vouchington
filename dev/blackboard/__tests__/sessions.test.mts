import { describe, expect, it, vi } from 'vitest'

import type { BlackboardConnection, BlackboardSessionsClient } from '../client.mts'
import { connectAndEnsureSession, ensureSession } from '../sessions.mts'
import {
  HOSTED_ENV,
  sessionFixture,
  sessionsClientFixture,
} from '../test-helpers/client-fixtures.mts'

function fakeConnection(): BlackboardConnection {
  return { baseUrl: 'http://127.0.0.1:3000', token: 'test-token' }
}

describe('connectAndEnsureSession', () => {
  it('resolves the connection and ensures the session in one call', async () => {
    const ensure = vi.fn<BlackboardSessionsClient['ensure']>(async input => ({
      status: 'created' as const,
      session: sessionFixture(input),
    }))

    const connection = await connectAndEnsureSession({
      env: HOSTED_ENV,
      sessionId: 'sess-1',
      parentSessionId: null,
      agent: 'claude-code',
      version: '1.0.0',
      sessions: sessionsClientFixture({ ensure }),
    })

    expect(connection).toEqual({
      baseUrl: HOSTED_ENV.AGENT_BLACKBOARD_URL,
      token: HOSTED_ENV.AGENT_BLACKBOARD_TOKEN,
      readRetry: {},
    })
    expect(ensure).toHaveBeenCalledWith({
      id: 'sess-1',
      parentSessionId: null,
      agent: 'claude-code',
      version: '1.0.0',
    })
  })
})

describe('ensureSession', () => {
  const input = {
    sessionId: 'sess-1',
    parentSessionId: null,
    agent: 'claude-code',
    version: '1.0.0',
    connection: fakeConnection(),
  }

  it.each(['created', 'exists'] as const)(
    'returns the published client %s status',
    async status => {
      const ensure = vi.fn<BlackboardSessionsClient['ensure']>(async clientInput => ({
        status,
        session: sessionFixture(clientInput),
      }))

      await expect(
        ensureSession({ ...input, sessions: sessionsClientFixture({ ensure }) }),
      ).resolves.toEqual({ status })
    },
  )

  it('preserves a client failure message', async () => {
    const sessions = sessionsClientFixture({
      ensure: async () => {
        throw new Error('session sess-1 exists with different fields: agent mismatch')
      },
    })

    await expect(ensureSession({ ...input, sessions })).rejects.toThrow(
      /sessions ensure failed.*agent mismatch/s,
    )
  })
})
