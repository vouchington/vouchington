import {
  isBlackboardNotFound,
  resolveBlackboardConnection,
  type BlackboardEntriesClient,
} from '../blackboard/client.mts'
import { getEntries, type SessionEntry } from '../blackboard/entries.mts'
import { parseFlagArgs, type FlagKey } from '../blackboard/parse-flag-args.mts'
import { requireSessionId } from '../agent-session-id/resolve.mts'
import { isRetrospectiveEntry } from './retrospective-entry.mts'

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
  if (positional.length > 0) throw new Error('check does not accept positional arguments')
  return parsed
}

function formatList(value: unknown): string {
  return Array.isArray(value) && value.length > 0
    ? value
        .filter(v => v !== null && v !== undefined)
        .map(String)
        .join(', ') || 'none'
    : 'none'
}

function formatCheckResult(sessionId: string, entries: SessionEntry[]): string {
  const existingRetro = entries.find(isRetrospectiveEntry)
  if (!existingRetro) return `No retrospective saved yet for agent-blackboard session ${sessionId}.`
  return (
    `Retrospective already saved for agent-blackboard session ${sessionId} ` +
    `(entry created at ${existingRetro.createdAt}).\n` +
    `Covered issues: ${formatList(existingRetro.data.issues)}; prs: ${formatList(existingRetro.data.prs)}.`
  )
}

// Read-only mirror of dev/blackboard-journal/entries.mts: does not ensureSession,
// so a session that was never created (the client's 404, which getEntries
// keeps as the cause) is not an error — it just means no retrospective exists yet. Any
// other failure (missing token, unreachable server, bad session id format)
// propagates so the caller can tell "no retrospective" apart from "the
// blackboard is unavailable and this answer can't be trusted."
export async function runCheck(
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
    newRootCodexSession: parsed.newRootCodexSession,
    rootCodex: parsed.rootCodex,
  })
  const connection = await resolveBlackboardConnection({ env })
  try {
    const entries = await getEntries({ sessionId, connection, entries: entriesClient })
    return formatCheckResult(sessionId, entries)
  } catch (error) {
    if (isBlackboardNotFound(error))
      return `No retrospective saved yet for agent-blackboard session ${sessionId} (session not created).`
    throw error
  }
}
