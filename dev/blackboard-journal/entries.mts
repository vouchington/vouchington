import { formatJournalEntries, readJournal } from 'vouchington-tooling/agent-blackboard'

import { clientDependencies, type BlackboardEntriesClient } from '../blackboard/client.mts'
import { parseFlagArgs, type FlagKey } from '../blackboard/parse-flag-args.mts'
import { requireSessionId } from '../agent-session-id/resolve.mts'

type ParsedArgs = {
  newRootCodexSession?: boolean
  rootCodex?: boolean
  sessionIdArg?: string
}

const FLAG_KEYS: Record<string, FlagKey<ParsedArgs>> = {
  '--session-id': 'sessionIdArg',
  '--new-root-codex-session': { key: 'newRootCodexSession', type: 'boolean' },
  '--root-codex': { key: 'rootCodex', type: 'boolean' },
}

function parseArgs(argv: string[]): ParsedArgs {
  const { parsed, positional } = parseFlagArgs<ParsedArgs>(argv, FLAG_KEYS)
  if (positional.length > 0) throw new Error('entries does not accept positional arguments')
  return parsed
}

// Server-read-only: does not ensureSession, so a session with zero journal entries
// (never created) is expected, not an error — the "-> 404" GET failure that
// getEntries surfaces for a nonexistent session is caught and reported as
// empty. Any other failure (unreachable server, auth) propagates, since that
// is exactly the blackboard-unavailable condition the retrospective skill's
// sourcing order must stop on rather than silently fall through past. Root-Codex resolution may
// still persist and read back its local identity before this server read.
export async function runEntries(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  entriesClient?: BlackboardEntriesClient,
  cwd: string = process.cwd(),
): Promise<string> {
  const parsed = parseArgs(argv)
  const sessionId = requireSessionId({
    sessionIdArg: parsed.sessionIdArg,
    env,
    cwd,
    rootCodex: parsed.rootCodex,
    newRootCodexSession: parsed.newRootCodexSession,
  })
  try {
    const entries = await readJournal(sessionId, env, {
      ...clientDependencies({ entries: entriesClient }),
    })
    return formatJournalEntries(sessionId, entries)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const notFound = new RegExp(`GET /sessions/${RegExp.escape(sessionId)}/entries -> 404`)
    if (notFound.test(message)) return `No journal entries found for session ${sessionId}.`
    throw error
  }
}
