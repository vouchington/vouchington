import { formatError } from 'agent-blackboard'

import {
  createSessionsClient,
  resolveBlackboardConnection,
  type BlackboardConnection,
  type BlackboardSessionsClient,
} from './client.mts'

export type EnsureSessionInput = {
  sessionId: string
  parentSessionId: string | null
  agent: string
  version: string
  connection: BlackboardConnection
  sessions?: BlackboardSessionsClient
}
export type EnsureSessionResult = { status: 'created' | 'exists' }

// The published client's idempotent ensure operation owns the 409/read-back/exact-field-match
// contract. Filaments deliberately does not duplicate that protocol logic.
export async function ensureSession(input: EnsureSessionInput): Promise<EnsureSessionResult> {
  const sessions = input.sessions ?? createSessionsClient(input.connection)
  try {
    const { status } = await sessions.ensure({
      id: input.sessionId,
      parentSessionId: input.parentSessionId,
      agent: input.agent,
      version: input.version,
    })
    return { status }
  } catch (error) {
    throw new Error(`sessions ensure failed: ${formatError(error)}`, { cause: error })
  }
}

export type ConnectAndEnsureSessionInput = {
  env?: NodeJS.ProcessEnv
  sessionId: string
  parentSessionId: string | null
  agent: string
  version: string
  sessions?: BlackboardSessionsClient
}

// Shared by dev/blackboard-journal/append.mts and dev/retrospective-save/save.mts:
// collapses connection-resolution + session-ensure into one await so each caller's
// remaining awaits stay under the no-three-sequential-awaits threshold.
export async function connectAndEnsureSession(
  input: ConnectAndEnsureSessionInput,
): Promise<BlackboardConnection> {
  const connection = await resolveBlackboardConnection({ env: input.env })
  await ensureSession({
    sessionId: input.sessionId,
    parentSessionId: input.parentSessionId,
    agent: input.agent,
    version: input.version,
    connection,
    sessions: input.sessions,
  })
  return connection
}
