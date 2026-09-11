import { appendJournal } from 'vouchington-tooling/agent-blackboard'

import {
  clientDependencies,
  type BlackboardEntriesClient,
  type BlackboardSessionsClient,
} from '../blackboard/client.mts'
import { parseFlagArgs, type FlagKey } from '../blackboard/parse-flag-args.mts'
import {
  requireBlackboardIdentity,
  validateRootCodexOptions,
} from '../agent-session-id/resolve.mts'

type ParsedArgs = {
  noteFile?: string
  sessionIdArg?: string
  parentSessionId?: string
  agent?: string
  newRootCodexSession?: boolean
  rootCodex?: boolean
  version?: string
  timestamp?: string
}

const FLAG_KEYS: Record<string, FlagKey<ParsedArgs>> = {
  '--file': 'noteFile',
  '--session-id': 'sessionIdArg',
  '--parent-session-id': 'parentSessionId',
  '--agent': 'agent',
  '--new-root-codex-session': { key: 'newRootCodexSession', type: 'boolean' },
  '--root-codex': { key: 'rootCodex', type: 'boolean' },
  '--version': 'version',
  '--timestamp': 'timestamp',
}

function parseArgs(argv: string[]): ParsedArgs {
  const { parsed, positional } = parseFlagArgs<ParsedArgs>(argv, FLAG_KEYS)
  if (positional.length > 0)
    throw new Error('append does not accept positional note arguments; use --file <path>')
  return parsed
}

// Carries the fields dev/blackboard-journal.mts's main() needs to print a
// `Replay with: node dev/blackboard-journal.mts append --file ...` hint on stderr —
// the hard-fail contract's whole point is that a caller can always retry by hand.
export class BlackboardJournalError extends Error {
  readonly noteFile?: string
  readonly sessionIdArg?: string
  readonly parentSessionId?: string
  readonly agent?: string
  readonly newRootCodexSession?: boolean
  readonly rootCodex?: boolean
  readonly version?: string
  readonly timestamp?: string

  constructor(message: string, info: ParsedArgs, cause?: unknown) {
    super(message, { cause })
    this.name = 'BlackboardJournalError'
    this.noteFile = info.noteFile
    this.sessionIdArg = info.sessionIdArg
    this.parentSessionId = info.parentSessionId
    this.agent = info.agent
    this.newRootCodexSession = info.newRootCodexSession
    this.rootCodex = info.rootCodex
    this.version = info.version
    this.timestamp = info.timestamp
  }
}

// No filesystem fallback: any failure past this point (missing token, unreachable
// server, CLI error) hard-fails as a BlackboardJournalError, never falls back to
// writing the note anywhere else.
export async function runAppend(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  clients: {
    sessions?: BlackboardSessionsClient
    entries?: BlackboardEntriesClient
  } = {},
  cwd = process.cwd(),
): Promise<string> {
  const parsed = parseArgs(argv)
  if (!parsed.noteFile) throw new Error('append requires --file <path>')
  validateRootCodexOptions({ ...parsed, agentArg: parsed.agent })
  const noteFile = parsed.noteFile
  let replayInfo = parsed

  try {
    const { agent, sessionId } = requireBlackboardIdentity({
      agentArg: parsed.agent,
      cwd,
      env,
      newRootCodexSession: parsed.newRootCodexSession,
      parentSessionId: parsed.parentSessionId,
      rootCodex: parsed.rootCodex,
      sessionIdArg: parsed.sessionIdArg,
    })
    if (parsed.newRootCodexSession) {
      replayInfo = {
        ...parsed,
        agent: 'codex',
        newRootCodexSession: undefined,
        rootCodex: undefined,
        sessionIdArg: sessionId,
      }
    }
    const version = parsed.version ?? 'unknown'
    const parentSessionId = parsed.parentSessionId ?? null
    const timestamp = parsed.timestamp ?? new Date().toISOString()

    return await appendJournal({
      env,
      sessionId,
      parentSessionId,
      agent,
      version,
      markdownFile: noteFile,
      timestamp,
      dependencies: clientDependencies(clients),
    })
  } catch (error) {
    throw new BlackboardJournalError(
      error instanceof Error ? error.message : String(error),
      replayInfo,
      error,
    )
  }
}
