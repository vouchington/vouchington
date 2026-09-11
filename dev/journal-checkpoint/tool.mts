import * as path from 'node:path'

import type { BlackboardAgentHints } from '../agent-session-id/resolve.mts'
import type { BlackboardClients } from './append.mts'
import {
  hookSessionId,
  isFailureCandidate,
  isMilestoneCandidate,
  type HookPayload,
  type MilestoneKind,
} from './checkpoints.mts'

const FAILURE_JOURNAL_INTERVAL = 3

function firstLines(text: string, maxLines = 6, maxChars = 800): string {
  const trimmed = text.split('\n').filter(Boolean).slice(0, maxLines).join('\n')
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed
}

// Checkpoints 2 and 3 (#9337): repeated failure capture and PR/push milestones, sharing one
// PostToolUse process. Detection (checkpoints.mts) is cheap, plain string/regex work on an
// already-parsed payload; the blackboard client and its network dependency are only ever imported
// below, after a checkpoint has actually matched, so the overwhelming majority of Bash calls pay
// no cost beyond this module and its detection functions.
export async function runToolCheckpoint(
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
  clients: BlackboardClients = {},
  runtime?: BlackboardAgentHints['runtime'],
): Promise<void> {
  const sessionId = hookSessionId(payload)
  if (sessionId === '') return

  const failure = isFailureCandidate(payload)
  if (failure) {
    await handleFailureCandidate(failure, sessionId, env, clients, runtime)
    return
  }

  const milestone = isMilestoneCandidate(payload)
  if (milestone) await handleMilestoneCandidate(milestone, sessionId, env, clients, runtime)
}

async function handleFailureCandidate(
  failure: { command: string; message: string },
  sessionId: string,
  env: NodeJS.ProcessEnv,
  clients: BlackboardClients,
  runtime?: BlackboardAgentHints['runtime'],
): Promise<void> {
  const { recordFailure } = await import('./failure-counter.mts')
  const worktreeRoot = path.resolve(import.meta.dirname, '..', '..')
  const result = recordFailure(sessionId, worktreeRoot, {
    command: failure.command,
    stderrHead: firstLines(failure.message),
  })
  if (!result || result.count % FAILURE_JOURNAL_INTERVAL !== 0) return

  const [{ renderFailureNote }, { appendCheckpoint }] = await Promise.all([
    import('./note.mts'),
    import('./append.mts'),
  ])
  await appendCheckpoint({
    checkpoint: 'command-failure',
    env,
    markdown: renderFailureNote(result.count, result.failures),
    runtime,
    sessionId,
    ...clients,
  }).catch(() => {})
}

async function handleMilestoneCandidate(
  milestone: { command: string; evidence: string; kind: MilestoneKind },
  sessionId: string,
  env: NodeJS.ProcessEnv,
  clients: BlackboardClients,
  runtime?: BlackboardAgentHints['runtime'],
): Promise<void> {
  const [{ renderMilestoneNote }, { appendCheckpoint }] = await Promise.all([
    import('./note.mts'),
    import('./append.mts'),
  ])
  await appendCheckpoint({
    checkpoint: milestone.kind,
    env,
    markdown: renderMilestoneNote(milestone.command, milestone.kind, milestone.evidence),
    runtime,
    sessionId,
    ...clients,
  }).catch(() => {})
}
