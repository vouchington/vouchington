import { formatError, type SessionEntry } from 'agent-blackboard'

import {
  createEntriesClient,
  type BlackboardConnection,
  type BlackboardEntriesClient,
} from './client.mts'

export type { SessionEntry } from 'agent-blackboard'

export type GetEntriesInput = {
  sessionId: string
  connection: BlackboardConnection
  entries?: BlackboardEntriesClient
}

// The public client streams entries as an AsyncIterable. Vouchington consumes the complete
// session history for journal/retrospective operations, so collect it into the array those
// callers already use. A nonexistent session preserves the client's "-> 404" message.
export async function getEntries(input: GetEntriesInput): Promise<SessionEntry[]> {
  const entriesClient = input.entries ?? createEntriesClient(input.connection)
  try {
    const entries: SessionEntry[] = []
    for await (const entry of entriesClient.get({ sessionId: input.sessionId, format: 'json' })) {
      entries.push(entry)
    }
    return entries
  } catch (error) {
    throw new Error(`get failed: ${formatError(error)}`, { cause: error })
  }
}

export type AppendEntryInput = {
  sessionId: string
  data: Record<string, unknown>
  connection: BlackboardConnection
  entries?: BlackboardEntriesClient
}

export async function appendEntry(input: AppendEntryInput): Promise<SessionEntry> {
  const entries = input.entries ?? createEntriesClient(input.connection)
  try {
    return await entries.append({ sessionId: input.sessionId, data: input.data })
  } catch (error) {
    throw new Error(`append failed: ${formatError(error)}`, { cause: error })
  }
}
