import {
  HARNESS_IDS,
  type HarnessEnvironment,
  type HarnessId,
} from 'vouchington-tooling/agent-harness-identity'

import { enclosingWorktreeRoot, resolveAndPersistRootCodexSessionId } from './persist.mts'

export type BlackboardAgent = 'claude-code' | 'codex' | 'cursor' | 'grok'

export type BlackboardAgentHints = {
  runtime?: HarnessId
  transcriptPath?: string
}

export type ResolveOptions = BlackboardAgentHints & {
  agentArg?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  newRootCodexSession?: boolean
  parentSessionId?: string
  rootCodex?: boolean
  sessionIdArg?: string
}

export type BlackboardIdentity = {
  readonly agent: BlackboardAgent
  readonly harness: HarnessId
  readonly sessionId?: string
}

export const MISSING_SESSION_ID_ERROR =
  'no session id (set CLAUDE_CODE_SESSION_ID, CODEX_THREAD_ID, CURSOR_SESSION_ID, GROK_SESSION_ID, or pass --session-id; interactive root Codex without CODEX_THREAD_ID: use --root-codex --new-root-codex-session once, then --root-codex)'

const SESSION_ENV_NAME = {
  claude: 'CLAUDE_CODE_SESSION_ID',
  codex: 'CODEX_THREAD_ID',
  cursor: 'CURSOR_SESSION_ID',
  grok: 'GROK_SESSION_ID',
} as const satisfies Record<HarnessId, string>

export function agentFor(harness: HarnessId): BlackboardAgent {
  return harness === 'claude' ? 'claude-code' : harness
}

export function transcriptHarness(transcriptPath: string | undefined): HarnessId | undefined {
  const path = transcriptPath?.replaceAll('\\', '/')
  if (!path) return undefined
  if (path.includes('/.codex/') && path.endsWith('.jsonl')) return 'codex'
  if (path.includes('/.grok/') && path.endsWith('/updates.jsonl')) return 'grok'
  if (path.includes('/.claude/projects/') && path.endsWith('.jsonl')) return 'claude'
  return undefined
}

export function fromHarness(harness: HarnessId, sessionId?: string): BlackboardIdentity {
  return sessionId
    ? { agent: agentFor(harness), harness, sessionId }
    : { agent: agentFor(harness), harness }
}

export function harnessForSessionId(
  environment: HarnessEnvironment,
  sessionId: string,
): HarnessId | undefined {
  return HARNESS_IDS.find(harness => environment[harness].sessionId === sessionId)
}

// Only a harness's own session variable counts as owning the process. Markers such as GROK_AGENT,
// CURSOR_AGENT, or CLAUDECODE are shell-level and can be exported into any harness.
export function ownedSessions(
  environment: HarnessEnvironment,
): { harness: HarnessId; sessionId: string }[] {
  return HARNESS_IDS.flatMap(harness => {
    const sessionId = environment[harness].sessionId
    return sessionId ? [{ harness, sessionId }] : []
  })
}

// Two harnesses exporting the same id name one session; different ids mean one harness was
// launched from another's shell, and nothing in the environment says which is the innermost.
export function conflictingOwners(environment: HarnessEnvironment): HarnessId[] | undefined {
  const owned = ownedSessions(environment)
  if (new Set(owned.map(entry => entry.sessionId)).size < 2) return undefined
  return owned.map(entry => entry.harness)
}

export function ambiguousSessionMessage(owners: readonly HarnessId[]): string {
  const names = owners.map(harness => SESSION_ENV_NAME[harness]).join(', ')
  return (
    `ambiguous session id: ${names} are all set, so the owning harness cannot be inferred ` +
    'from the environment. Pass the session id explicitly (--session-id)'
  )
}

export function resolveRootCodexSessionId(
  cwd: string,
  payloadId: string | undefined,
  newSession: boolean | undefined,
): BlackboardIdentity {
  const resolved = resolveAndPersistRootCodexSessionId({
    cwd: enclosingWorktreeRoot(cwd),
    newSession,
    payloadId,
  })
  return fromHarness('codex', resolved.sessionId)
}
