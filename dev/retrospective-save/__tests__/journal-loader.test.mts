import { describe, expect, it } from 'vitest'
import type { JournalEntry } from 'vouchington-tooling/agent-blackboard'

import {
  blackboardStatusError,
  entriesClientFixture,
  entriesIterable,
  entryFixture,
  failingEntriesIterable,
  HOSTED_ENV,
} from '../../test-helpers/blackboard/client-fixtures.mts'
import { loadJournalEntries } from '../journal-loader.mts'

const BLOCK = '- `one-off` — `GitHub Actions` — lint job'

describe('loadJournalEntries', () => {
  it('maps an initial 404 to the journal loader not-found result', async () => {
    const entries = entriesClientFixture({
      get: () => failingEntriesIterable(blackboardStatusError(404)),
    })
    await expect(loadJournalEntries('s1', HOSTED_ENV, entries)).resolves.toEqual({
      status: 'not-found',
    })
  })

  it('reports a session with no entries as an empty journal', async () => {
    const entries = entriesClientFixture({ get: () => entriesIterable([]) })
    const loaded = await loadJournalEntries('s1', HOSTED_ENV, entries)
    expect(loaded).toEqual({ status: 'ok', entries: [] })
  })

  it('yields every entry of the session in order', async () => {
    const entries = entriesClientFixture({
      get: () =>
        entriesIterable([
          entryFixture({ data: { type: 'journal', markdown: BLOCK } }),
          entryFixture({ data: { type: 'retrospective', markdown: 'later' } }),
        ]),
    })
    const loaded = await loadJournalEntries('s1', HOSTED_ENV, entries)
    if (loaded.status !== 'ok') throw new Error('expected journal entries')
    const types: unknown[] = []
    for await (const entry of loaded.entries as AsyncIterable<JournalEntry>)
      types.push(entry.data?.type)
    expect(types).toEqual(['journal', 'retrospective'])
  })

  it('preserves a stream failure after the first entry', async () => {
    const entries = entriesClientFixture({
      get: () => ({
        async *[Symbol.asyncIterator]() {
          yield entryFixture({ data: { type: 'journal', markdown: BLOCK } })
          throw new TypeError('fetch failed')
        },
      }),
    })
    const loaded = await loadJournalEntries('s1', HOSTED_ENV, entries)
    if (loaded.status !== 'ok') throw new Error('expected journal entries')
    const iterator = (loaded.entries as AsyncIterable<JournalEntry>)[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    await expect(iterator.next()).rejects.toThrow('fetch failed')
  })
})
