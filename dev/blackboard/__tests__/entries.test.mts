import { describe, expect, it, vi } from 'vitest'

import type { BlackboardConnection, BlackboardEntriesClient } from '../client.mts'
import { appendEntry, getEntries } from '../entries.mts'
import {
  entriesClientFixture,
  entriesIterable,
  entryFixture,
  failingEntriesIterable,
} from '../../test-helpers/blackboard/client-fixtures.mts'

function fakeConnection(): BlackboardConnection {
  return { baseUrl: 'http://127.0.0.1:3000', token: 'test-token' }
}

describe('appendEntry', () => {
  it('returns the entry from the public client', async () => {
    const appended = entryFixture()
    const append = vi.fn<BlackboardEntriesClient['append']>(async () => appended)

    await expect(
      appendEntry({
        sessionId: 'sess-1',
        data: { type: 'journal', markdown: 'note' },
        connection: fakeConnection(),
        entries: entriesClientFixture({ append }),
      }),
    ).resolves.toEqual(appended)
    expect(append).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      data: { type: 'journal', markdown: 'note' },
    })
  })

  it('preserves a client failure message', async () => {
    const entries = entriesClientFixture({
      append: async () => {
        throw new Error('agent-blackboard request failed: POST -> 500')
      },
    })
    await expect(
      appendEntry({
        sessionId: 'sess-1',
        data: { type: 'journal', markdown: 'note' },
        connection: fakeConnection(),
        entries,
      }),
    ).rejects.toThrow(/append failed.*-> 500/s)
  })
})

describe('getEntries', () => {
  it('collects the public client async iterable', async () => {
    const expected = [entryFixture()]
    const get = vi.fn<BlackboardEntriesClient['get']>(() => entriesIterable(expected))

    await expect(
      getEntries({
        sessionId: 'sess-1',
        connection: fakeConnection(),
        entries: entriesClientFixture({ get }),
      }),
    ).resolves.toEqual(expected)
    expect(get).toHaveBeenCalledWith({ sessionId: 'sess-1', format: 'json' })
  })

  it('returns an empty array for an empty async iterable', async () => {
    await expect(
      getEntries({
        sessionId: 'sess-1',
        connection: fakeConnection(),
        entries: entriesClientFixture(),
      }),
    ).resolves.toEqual([])
  })

  it('preserves the "-> 404" substring for callers that match on it', async () => {
    const entries = entriesClientFixture({
      get: () =>
        failingEntriesIterable(
          'agent-blackboard request failed: GET /sessions/sess-1/entries -> 404',
        ),
    })
    await expect(
      getEntries({ sessionId: 'sess-1', connection: fakeConnection(), entries }),
    ).rejects.toThrow(/get failed.*-> 404/s)
  })
})
