import { appendJournal, type FeedbackDeliveryResult } from 'vouchington-tooling/agent-blackboard'

import { parseFlagArgs, type FlagKey } from '../blackboard/parse-flag-args.mts'
import {
  requireBlackboardIdentity,
  validateRootCodexOptions,
} from '../agent-session-id/resolve.mts'
import { resolveFeedbackFlags } from './feedback-flags.mts'

type ParsedArgs = {
  noteFile?: string
  sessionIdArg?: string
  parentSessionId?: string
  agent?: string
  newRootCodexSession?: boolean
  rootCodex?: boolean
  version?: string
  timestamp?: string
  repositories?: string[]
  mode?: string
  sourceEventId?: string
  workOutcome?: string
  coverageStatus?: string
  coverageSource?: string
  droppedCount?: string
  outboxDirectory?: string
}

// Journal entries record every repository they concern. Without an explicit --repository, a note
// written from this checkout concerns this repository alone.
export const DEFAULT_JOURNAL_REPOSITORY = 'vouchington/vouchington'

const FLAG_KEYS: Record<string, FlagKey<ParsedArgs>> = {
  '--file': 'noteFile',
  '--session-id': 'sessionIdArg',
  '--parent-session-id': 'parentSessionId',
  '--agent': 'agent',
  '--new-root-codex-session': { key: 'newRootCodexSession', type: 'boolean' },
  '--root-codex': { key: 'rootCodex', type: 'boolean' },
  '--version': 'version',
  '--timestamp': 'timestamp',
  '--repository': { key: 'repositories', type: 'repeatable' },
  '--mode': 'mode',
  '--source-event-id': 'sourceEventId',
  '--work-outcome': 'workOutcome',
  '--coverage-status': 'coverageStatus',
  '--coverage-source': 'coverageSource',
  '--dropped-count': 'droppedCount',
  '--outbox-directory': 'outboxDirectory',
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
  readonly repositories?: string[]
  readonly mode?: string
  readonly sourceEventId?: string
  readonly workOutcome?: string
  readonly coverageStatus?: string
  readonly coverageSource?: string
  readonly droppedCount?: string
  readonly outboxDirectory?: string

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
    this.repositories = info.repositories
    this.mode = info.mode
    this.sourceEventId = info.sourceEventId
    this.workOutcome = info.workOutcome
    this.coverageStatus = info.coverageStatus
    this.coverageSource = info.coverageSource
    this.droppedCount = info.droppedCount
    this.outboxDirectory = info.outboxDirectory
  }
}

// A thrown failure becomes a replayable BlackboardJournalError. Interactive mode can
// instead return pending after the caller-supplied outbox retains the envelope.
export async function runAppend(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<FeedbackDeliveryResult> {
  const parsed = parseArgs(argv)
  if (!parsed.noteFile) throw new Error('append requires --file <path>')
  validateRootCodexOptions({ ...parsed, agentArg: parsed.agent })
  const noteFile = parsed.noteFile
  let replayInfo = parsed

  try {
    const feedback = resolveFeedbackFlags(parsed)
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
      repositories: parsed.repositories ?? [DEFAULT_JOURNAL_REPOSITORY],
      markdownFile: noteFile,
      timestamp,
      ...feedback,
    })
  } catch (err) {
    throw new BlackboardJournalError(
      err instanceof Error ? err.message : String(err),
      replayInfo,
      err,
    )
  }
}
