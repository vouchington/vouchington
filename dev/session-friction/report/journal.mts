import type { JournalEntry, JournalLoadResult } from 'vouchington-tooling/session-friction'

import {
  createEntriesClient,
  isBlackboardNotFound,
  resolveBlackboardConnection,
  type BlackboardEntriesClient,
} from '../../blackboard/client.mts'

export async function loadJournalEntries(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
  entriesClient?: BlackboardEntriesClient,
): Promise<JournalLoadResult> {
  const connection = await resolveBlackboardConnection({ env })
  const entries = entriesClient ?? createEntriesClient(connection)
  const iterator = entries.get({ sessionId, format: 'json' })[Symbol.asyncIterator]()
  let first: IteratorResult<JournalEntry>
  try {
    first = await iterator.next()
  } catch (error) {
    if (isBlackboardNotFound(error)) return { status: 'not-found' }
    throw error
  }
  if (first.done) return { status: 'ok', entries: [] }

  async function* fromFirst(): AsyncIterable<JournalEntry> {
    yield first.value
    yield* { [Symbol.asyncIterator]: () => iterator }
  }
  return { status: 'ok', entries: fromFirst() }
}
