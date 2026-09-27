import { isUtf8 } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  writeFeedback,
  type BlackboardClientDependencies,
} from 'vouchington-tooling/agent-blackboard'

import {
  FEEDBACK_FLAGS,
  feedbackMode,
  feedbackOutcome,
  feedbackCoverage,
  feedbackResult,
  type FeedbackArgs,
} from '../blackboard/feedback-options.mts'

import { parseFlagArgs, type FlagKey } from '../blackboard/parse-flag-args.mts'
import {
  requireBlackboardIdentity,
  validateRootCodexOptions,
} from '../agent-session-id/resolve.mts'
import { validateRetroDoc } from '../retrospective-validate.mts'
import { parseFrontMatter } from './front-matter.mts'
import { retrospectiveEnvelope } from './feedback-metadata.mts'

type ParsedArgs = FeedbackArgs & {
  timestamp?: string
  repositories?: string[]
  stagedFile?: string
  sessionIdArg?: string
  parentSessionId?: string
  agent?: string
  newRootCodexSession?: boolean
  rootCodex?: boolean
  version?: string
}

const FLAG_KEYS: Record<string, FlagKey<ParsedArgs>> = {
  ...FEEDBACK_FLAGS,
  '--timestamp': 'timestamp',
  '--repository': { key: 'repositories', type: 'repeatable' },
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
  readonly feedback: ParsedArgs

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
    this.feedback = info
  }
}

async function readAndValidateDoc(stagedFile: string): Promise<string> {
  const buffer = await readFile(stagedFile)
  if (buffer.length === 0) throw new Error(`staged retrospective file is empty: ${stagedFile}`)
  if (!isUtf8(buffer))
    throw new Error(`staged retrospective file is not valid UTF-8: ${stagedFile}`)
  return buffer.toString('utf8')
}

// Content validation precedes the shared delivery boundary in either execution mode.
export async function runSave(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: BlackboardClientDependencies = {},
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
    const {
      date,
      issues,
      prs,
      sessionId: stagedSessionId,
      feedbackMetadata,
    } = parseFrontMatter(markdown)
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

    const mode = feedbackMode(parsed.mode)
    if (mode === 'autonomous' && parsed.outboxDirectory)
      throw new Error('autonomous delivery cannot use an interactive outbox')
    const sourceEventId = parsed.sourceEventId ?? `retrospective-${sessionId}`
    const timestamp = parsed.timestamp ?? `${date}T00:00:00.000Z`
    replayInfo = { ...replayInfo, sourceEventId, timestamp }
    const envelope = retrospectiveEnvelope(
      {
        schemaVersion: 1,
        type: 'retrospective',
        sourceEventId,
        timestamp,
        markdown,
        repositories: parsed.repositories ?? ['vouchington/vouchington'],
        workOutcome: feedbackMetadata
          ? feedbackMetadata.workOutcome
          : feedbackOutcome(parsed.workOutcome, false),
        feedbackCoverage: feedbackMetadata
          ? feedbackMetadata.feedbackCoverage
          : feedbackCoverage(parsed),
        ...(parsed.category === undefined ? {} : { category: parsed.category }),
        date,
        issues,
        prs,
      },
      parsed,
    )
    return feedbackResult(
      await writeFeedback({
        env,
        identity: {
          sessionId,
          parentSessionId: parsed.parentSessionId ?? null,
          agent,
          version: parsed.version ?? 'unknown',
        },
        envelope,
        mode,
        ...(mode === 'interactive'
          ? { outboxDirectory: parsed.outboxDirectory ?? join(cwd, '.local', 'blackboard-outbox') }
          : {}),
        dependencies,
      }),
    )
  } catch (error) {
    throw new RetrospectiveSaveError(
      error instanceof Error ? error.message : String(error),
      replayInfo,
      error,
    )
  }
}
