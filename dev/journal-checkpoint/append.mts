import { appendEntry } from '../blackboard/entries.mts'
import { connectAndEnsureSession } from '../blackboard/sessions.mts'
import type { BlackboardEntriesClient, BlackboardSessionsClient } from '../blackboard/client.mts'
import {
  requireBlackboardIdentity,
  type BlackboardAgentHints,
} from '../agent-session-id/resolve.mts'
import { CHECKPOINT_ENTRY_FIELD, type CheckpointKind } from './checkpoint-entry.mts'

// Comfortably under the 10-15s SessionStart/PostToolUse hook timeouts in .claude/settings.json
// and .codex/config.toml, so a hung connect/append resolves (fails open) before the harness's own
// timeout would otherwise kill the process and surface as hook-failure noise.
const APPEND_TIMEOUT_MS = 5_000

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Injectable blackboard clients, threaded through compact.mts/tool.mts so their orchestration
// tests can assert on a real append call (via the same sessionsClientFixture()/
// entriesClientFixture() pattern check-blackboard.test.mts uses) instead of hitting the network
// or reaching for module-level mocking, which this codebase doesn't otherwise use.
export type BlackboardClients = {
  entries?: BlackboardEntriesClient
  sessions?: BlackboardSessionsClient
}

export type AppendCheckpointInput = BlackboardClients &
  BlackboardAgentHints & {
    checkpoint: CheckpointKind
    cwd?: string
    env?: NodeJS.ProcessEnv
    markdown: string
    sessionId: string
  }

// Fail-open counterpart to dev/blackboard-journal/append.mts's runAppend. That command's
// no-filesystem-fallback hard-fail contract is deliberate for agent-INITIATED journaling, where a
// human is watching and can react to a printed replay command. This entry point instead runs
// unattended inside a hook subprocess: a missing credential, a network blip, a sandboxed run, or a
// stale/removed session must never surface as hook noise, a blocked tool call, or a nonzero exit.
// Every failure here is caller-swallowed (dev/journal-checkpoint/{compact,tool}.mts each end their
// call with `.catch(() => {})`); this function only decides WHETHER to attempt the write.
export async function appendCheckpoint(input: AppendCheckpointInput): Promise<void> {
  const env = input.env ?? process.env
  // See dev/check-blackboard.mts: the Claude Code sandbox denies AGENT_BLACKBOARD_TOKEN and
  // blocks egress, so a sandboxed run can't tell "outage" apart from "no credential" — skip
  // rather than treat that as a real failure.
  if (env.SANDBOX_RUNTIME) return
  if (env.JOURNAL_CHECKPOINT_SKIP === '1') return
  // Presence-only check — never log, print, or otherwise surface the credential value itself.
  if (!env.AGENT_BLACKBOARD_URL || !env.AGENT_BLACKBOARD_TOKEN) return
  if (input.sessionId === '') return

  let identity: { agent: string; sessionId: string }
  try {
    identity = requireBlackboardIdentity({
      cwd: input.cwd,
      env,
      runtime: input.runtime,
      sessionIdArg: input.sessionId,
      transcriptPath: input.transcriptPath,
    })
  } catch {
    return
  }
  const connection = await withTimeout(
    connectAndEnsureSession({
      agent: identity.agent,
      env,
      parentSessionId: null,
      sessionId: identity.sessionId,
      sessions: input.sessions,
      version: 'unknown',
    }),
    APPEND_TIMEOUT_MS,
    'journal-checkpoint connect/ensure',
  )
  await withTimeout(
    appendEntry({
      connection,
      data: {
        [CHECKPOINT_ENTRY_FIELD]: input.checkpoint,
        markdown: input.markdown,
        timestamp: new Date().toISOString(),
        type: 'journal',
      },
      entries: input.entries,
      sessionId: identity.sessionId,
    }),
    APPEND_TIMEOUT_MS,
    'journal-checkpoint append',
  )
}
