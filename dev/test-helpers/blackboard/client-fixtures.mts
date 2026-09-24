import { AgentBlackboardError, type Session, type SessionEntry } from 'agent-blackboard'

import type { BlackboardEntriesClient, BlackboardSessionsClient } from '../../blackboard/client.mts'

export const HOSTED_ENV = {
  AGENT_BLACKBOARD_URL: 'https://example.invalid/',
  AGENT_BLACKBOARD_TOKEN: 'test-token',
}

export function sessionFixture(
  overrides: Partial<Session> & Pick<Session, 'id' | 'agent' | 'version'>,
): Session {
  return {
    parentSessionId: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    lastEntryAt: null,
    archivedAt: null,
    data: {},
    ...overrides,
  }
}

export function entryFixture(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    sessionId: 'sess-1',
    createdAt: '2026-07-20T00:00:00.000Z',
    data: {},
    ...overrides,
  }
}

export function sessionsClientFixture(
  overrides: Partial<BlackboardSessionsClient> = {},
): BlackboardSessionsClient {
  return {
    ensure: async input => ({ status: 'created', session: sessionFixture(input) }),
    get: async id => sessionFixture({ id, agent: 'codex', version: 'unknown' }),
    list: async () => ({ sessions: [], nextCursor: null }),
    patch: async input =>
      sessionFixture({ id: input.sessionId, agent: 'codex', version: 'unknown', data: input.data }),
    ...overrides,
  }
}

export function entriesClientFixture(
  overrides: Partial<BlackboardEntriesClient> = {},
): BlackboardEntriesClient {
  return {
    append: async input => entryFixture(input),
    get: () => entriesIterable([]),
    ...overrides,
  }
}

export function entriesIterable(entries: SessionEntry[]): AsyncIterable<SessionEntry> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* entries
    },
  }
}

export function blackboardStatusError(status: number): AgentBlackboardError {
  return new AgentBlackboardError(`HTTP ${status}`, status, undefined)
}

export function failingEntriesIterable(error: Error): AsyncIterable<SessionEntry> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* []
      throw error
    },
  }
}
