import type { JournalEntry, JournalLoadResult } from 'vouchington-tooling/session-friction'

import {
  createEntriesClient,
  resolveBlackboardConnection,
  type BlackboardEntriesClient,
} from '../../blackboard/client.mts'

function isNotFound(error: unknown, sessionId: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return new RegExp(`GET /sessions/${RegExp.escape(sessionId)}/entries -> 404`).test(message)
}

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
    if (isNotFound(error, sessionId)) return { status: 'not-found' }
    throw error
  }
  if (first.done) return { status: 'ok', entries: [] }

  async function* fromFirst(): AsyncIterable<JournalEntry> {
    yield first.value
    yield* { [Symbol.asyncIterator]: () => iterator }
  }
  return { status: 'ok', entries: fromFirst() }
}
