import { AgentBlackboardError, Entries, Sessions, type ClientConfig } from 'agent-blackboard'
import {
  resolveBlackboardConnection as resolvePortableBlackboardConnection,
  type BlackboardClientDependencies,
} from 'vouchington-tooling/agent-blackboard'

export type BlackboardConnection = ClientConfig

export type BlackboardSessionsClient = Pick<Sessions, 'ensure' | 'get' | 'list' | 'patch'>

export type BlackboardEntriesClient = Pick<Entries, 'append' | 'get'>

export function createSessionsClient(connection: BlackboardConnection): BlackboardSessionsClient {
  return new Sessions(connection)
}

export function createEntriesClient(connection: BlackboardConnection): BlackboardEntriesClient {
  return new Entries(connection)
}

// A never-created session reads as a 404 from the public client, possibly wrapped by a caller.
export function isBlackboardNotFound(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof AgentBlackboardError) return current.status === 404
  }
  return false
}

// The portable helpers accept a lazy client loader so their optional peer remains optional.
// Vouchington keeps these thin adapters solely for existing callers and their focused test seams.
export function clientDependencies(clients: {
  sessions?: BlackboardSessionsClient
  entries?: BlackboardEntriesClient
}): BlackboardClientDependencies | undefined {
  if (!clients.sessions && !clients.entries) return undefined
  return {
    loadClient: async () => ({
      Sessions: class {
        private readonly connection: BlackboardConnection

        constructor(connection: BlackboardConnection) {
          this.connection = connection
        }

        ensure(input: unknown) {
          return (clients.sessions ?? createSessionsClient(this.connection)).ensure(input as never)
        }

        list(input: unknown) {
          return (clients.sessions ?? createSessionsClient(this.connection)).list(input as never)
        }

        patch(input: unknown) {
          return (clients.sessions ?? createSessionsClient(this.connection)).patch(input as never)
        }

        get(id: string) {
          return (clients.sessions ?? createSessionsClient(this.connection)).get(id)
        }
      },
      Entries: class {
        private readonly connection: BlackboardConnection

        constructor(connection: BlackboardConnection) {
          this.connection = connection
        }

        append(input: unknown) {
          return (clients.entries ?? createEntriesClient(this.connection)).append(input as never)
        }

        get(input: unknown) {
          return (clients.entries ?? createEntriesClient(this.connection)).get(input as never)
        }
      },
    }),
  }
}

// Resolves the public agent-blackboard client configuration for the hosted deployment.
// Static package resolution happens before this function; a missing root install surfaces Node's
// module-resolution error and is recovered with `pnpm install`. Only the hosted deployment URL
// and client credential need explicit validation here.
export async function resolveBlackboardConnection(
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<BlackboardConnection> {
  const env = options.env ?? process.env
  try {
    return resolvePortableBlackboardConnection(env)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'AGENT_BLACKBOARD_URL is not set') {
      throw new Error(
        `${message}; export the hosted agent-blackboard deployment URL — see docs/development/agent-blackboard.md`,
        { cause: error },
      )
    }
    if (message === 'AGENT_BLACKBOARD_TOKEN is not set') {
      throw new Error(
        `${message}; export a client credential for the hosted agent-blackboard deployment — see docs/development/agent-blackboard.md`,
        { cause: error },
      )
    }
    throw error
  }
}
