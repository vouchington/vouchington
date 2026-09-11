import { isUtf8 } from 'node:buffer'
import { readFile } from 'node:fs/promises'

import { appendEntry, getEntries } from '../blackboard/entries.mts'
import type { BlackboardEntriesClient, BlackboardSessionsClient } from '../blackboard/client.mts'
import { parseFlagArgs, type FlagKey } from '../blackboard/parse-flag-args.mts'
import { connectAndEnsureSession } from '../blackboard/sessions.mts'
import {
  requireBlackboardIdentity,
  validateRootCodexOptions,
} from '../agent-session-id/resolve.mts'
import { validateRetroDoc } from '../retrospective-validate.mts'
import { parseFrontMatter } from './front-matter.mts'
import { isRetrospectiveEntry, RETROSPECTIVE_ENTRY_TYPE } from './retrospective-entry.mts'

type ParsedArgs = {
  stagedFile?: string
  sessionIdArg?: string
  parentSessionId?: string
  agent?: string
  newRootCodexSession?: boolean
  rootCodex?: boolean
  version?: string
}

const FLAG_KEYS: Record<string, FlagKey<ParsedArgs>> = {
  '--file': 'stagedFile',
  '--session-id': 'sessionIdArg',
  '--parent-session-id': 'parentSessionId',
  '--agent': 'agent',
  '--new-root-codex-session': { key: 'newRootCodexSession', type: 'boolean' },
  '--root-codex': { key: 'rootCodex', type: 'boolean' },
  '--version': 'version',
}

function parseArgs(argv: string[]): ParsedArgs {
  const { parsed, positional } = parseFlagArgs<ParsedArgs>(argv, FLAG_KEYS)
  if (positional.length > 0)
    throw new Error('save does not accept positional arguments; use --file <path>')
  return parsed
}

// Carries the fields dev/retrospective-save.mts's main() needs to print a
// `Replay with: node dev/retrospective-save.mts save --file ...` hint on stderr —
// re-running the same command is the correct fix whether the failure was a
// validation error (fix the staged file first) or a transient store failure.
export class RetrospectiveSaveError extends Error {
  readonly stagedFile?: string
  readonly sessionIdArg?: string
  readonly parentSessionId?: string
  readonly agent?: string
  readonly newRootCodexSession?: boolean
  readonly rootCodex?: boolean
  readonly version?: string

  constructor(message: string, info: ParsedArgs, cause?: unknown) {
    super(message, { cause })
    this.name = 'RetrospectiveSaveError'
    this.stagedFile = info.stagedFile
    this.sessionIdArg = info.sessionIdArg
    this.parentSessionId = info.parentSessionId
    this.agent = info.agent
    this.newRootCodexSession = info.newRootCodexSession
    this.rootCodex = info.rootCodex
    this.version = info.version
  }
}

async function readAndValidateDoc(stagedFile: string): Promise<string> {
  const buffer = await readFile(stagedFile)
  if (buffer.length === 0) throw new Error(`staged retrospective file is empty: ${stagedFile}`)
  if (!isUtf8(buffer))
    throw new Error(`staged retrospective file is not valid UTF-8: ${stagedFile}`)
  return buffer.toString('utf8')
}

// No filesystem fallback: assemble -> validate -> append -> read-back all happen
// here. Any failure past arg-parsing hard-fails as a RetrospectiveSaveError, never
// falls back to writing the doc anywhere else.
export async function runSave(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  clients: {
    sessions?: BlackboardSessionsClient
    entries?: BlackboardEntriesClient
  } = {},
  cwd = process.cwd(),
): Promise<string> {
  const parsed = parseArgs(argv)
  if (!parsed.stagedFile) throw new Error('save requires --file <path>')
  validateRootCodexOptions({ ...parsed, agentArg: parsed.agent })
  const stagedFile = parsed.stagedFile
  let replayInfo = parsed

  try {
    const markdown = await readAndValidateDoc(stagedFile)
    const validation = validateRetroDoc(markdown)
    if (!validation.ok) {
      throw new Error(`retrospective doc failed validation:\n- ${validation.errors.join('\n- ')}`)
    }
    const { date, issues, prs, sessionId: stagedSessionId } = parseFrontMatter(markdown)
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
      // Rotation already persisted above; replay pins the selected id explicitly.
      replayInfo = {
        ...parsed,
        agent: 'codex',
        newRootCodexSession: undefined,
        rootCodex: undefined,
        sessionIdArg: sessionId,
      }
    }
    if (stagedSessionId !== undefined && stagedSessionId !== sessionId) {
      throw new Error(
        `retrospective doc session_id ${stagedSessionId} does not match resolved session ${sessionId}`,
      )
    }

    const connection = await connectAndEnsureSession({
      env,
      sessionId,
      parentSessionId: parsed.parentSessionId ?? null,
      agent,
      version: parsed.version ?? 'unknown',
      sessions: clients.sessions,
    })

    const existing = await getEntries({ sessionId, connection, entries: clients.entries })
    const existingRetro = existing.find(isRetrospectiveEntry)
    if (existingRetro) {
      return (
        `Retrospective already saved for agent-blackboard session ${sessionId} ` +
        `(entry created at ${existingRetro.createdAt}); skipping duplicate append.`
      )
    }

    const entry = await appendEntry({
      sessionId,
      data: { type: RETROSPECTIVE_ENTRY_TYPE, markdown, issues, prs, date },
      connection,
      entries: clients.entries,
    })

    const confirmed = await getEntries({ sessionId, connection, entries: clients.entries })
    const persisted = confirmed.some(
      candidate => isRetrospectiveEntry(candidate) && candidate.createdAt === entry.createdAt,
    )
    if (!persisted) {
      throw new Error(
        `saved retrospective failed read-back verification ` +
          `(entry created at ${entry.createdAt} not found on re-read)`,
      )
    }

    return `Saved retrospective to agent-blackboard session ${sessionId} (entry created at ${entry.createdAt}).`
  } catch (error) {
    throw new RetrospectiveSaveError(
      error instanceof Error ? error.message : String(error),
      replayInfo,
      error,
    )
  }
}
