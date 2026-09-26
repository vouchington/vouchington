import {
  inspectHarnessEnvironment,
  selectHarnessSession,
  type HarnessId,
} from 'vouchington-tooling/agent-harness-identity'

import {
  enclosingWorktreeRoot,
  readPersistedSessionId,
  resolveAndPersistRootCodexSessionId,
} from './persist.mts'
import { validateRootCodexOptions } from './root-codex-options.mts'
import { isValidSessionId } from './valid-id.mts'

export { validateRootCodexOptions } from './root-codex-options.mts'

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
const MISSING_SESSION_ID_ERROR =
  'no session id (set CLAUDE_CODE_SESSION_ID, CODEX_THREAD_ID, CURSOR_SESSION_ID, GROK_SESSION_ID, or pass --session-id; interactive root Codex without CODEX_THREAD_ID: use --root-codex --new-root-codex-session once, then --root-codex)'

function agentFor(harness: HarnessId): BlackboardAgent {
  return harness === 'claude' ? 'claude-code' : harness
}

function transcriptHarness(transcriptPath: string | undefined): HarnessId | undefined {
  const path = transcriptPath?.replaceAll('\\', '/')
  if (!path) return undefined
  if (path.includes('/.codex/') && path.endsWith('.jsonl')) return 'codex'
  if (path.includes('/.grok/') && path.endsWith('/updates.jsonl')) return 'grok'
  if (path.includes('/.claude/projects/') && path.endsWith('.jsonl')) return 'claude'
  return undefined
}

function fromHarness(harness: HarnessId, sessionId?: string): BlackboardIdentity {
  return sessionId
    ? { agent: agentFor(harness), harness, sessionId }
    : { agent: agentFor(harness), harness }
}

function harnessForSessionId(
  environment: ReturnType<typeof inspectHarnessEnvironment>,
  sessionId: string,
): HarnessId | undefined {
  for (const harness of ['claude', 'codex', 'grok', 'cursor'] as const) {
    if (environment[harness].sessionId === sessionId) return harness
  }
  return undefined
}

function resolveRootCodexSessionId(
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
export function resolveAmbientBlackboardIdentity(
  options: ResolveOptions = {},
): BlackboardIdentity | undefined {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  validateRootCodexOptions(options)
  const environment = inspectHarnessEnvironment(env)
  if (options.sessionIdArg !== undefined) {
    const matched = harnessForSessionId(environment, options.sessionIdArg)
    const ambient = resolveAmbientBlackboardIdentity({
      ...options,
      rootCodex: false,
      sessionIdArg: undefined,
    })
    const harness =
      matched ??
      (environment.grok.hookEvent ? 'grok' : undefined) ??
      options.runtime ??
      ambient?.harness ??
      transcriptHarness(options.transcriptPath)
    return harness ? fromHarness(harness, options.sessionIdArg) : undefined
  }
  // Root-aware reads and writes both refresh persistence at the enclosing worktree root. This
  // trust boundary is conventional: a child that falsely passes the root flag inherits the root
  // identity.
  if (options.rootCodex)
    return resolveRootCodexSessionId(cwd, env.CODEX_THREAD_ID, options.newRootCodexSession)
  if (environment.claude.sessionId) return fromHarness('claude', environment.claude.sessionId)
  if (environment.claude.compatMode) {
    if (environment.grok.sessionId) {
      return environment.codex.sessionId
        ? fromHarness('codex', environment.codex.sessionId)
        : fromHarness('grok', environment.grok.sessionId)
    }
    if (!environment.grok.agentMarker)
      return environment.grok.hookEvent ? fromHarness('grok') : undefined
    if (environment.codex.sessionId || environment.cursor.sessionId) return undefined
    const sessionId = readPersistedSessionId(cwd, 'grok')
    return sessionId ? fromHarness('grok', sessionId) : { agent: 'grok', harness: 'grok' }
  }
  if ((environment.grok.sessionId || environment.grok.hookEvent) && !environment.codex.sessionId)
    return fromHarness('grok', environment.grok.sessionId)
  if (options.runtime) return fromHarness(options.runtime)
  const direct = selectHarnessSession(environment, ['codex', 'grok', 'cursor'])
  if (direct) return fromHarness(direct.harness, direct.sessionId)
  const persistedHarness = environment.grok.agentMarker ? 'grok' : 'cursor'
  const sessionId = readPersistedSessionId(cwd, persistedHarness)
  if (sessionId) return fromHarness(persistedHarness, sessionId)
  if (environment.grok.hookEvent) return { agent: 'grok', harness: 'grok' }
  const transcript = transcriptHarness(options.transcriptPath)
  if (transcript) return fromHarness(transcript)
  if (environment.grok.agentMarker) return fromHarness('grok')
  return environment.cursor.agentMarker ? fromHarness('cursor') : undefined
}

export function resolveSessionId(options: ResolveOptions = {}): string | undefined {
  const identity = resolveAmbientBlackboardIdentity(options)
  return options.sessionIdArg ?? identity?.sessionId
}

export function requireSessionId(options: ResolveOptions = {}): string {
  const sessionId = resolveSessionId(options)
  if (!sessionId) throw new Error(MISSING_SESSION_ID_ERROR)
  if (!isValidSessionId(sessionId)) throw new Error(`invalid session id format: ${sessionId}`)
  return sessionId
}

export function defaultBlackboardAgent(
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
  hints: BlackboardAgentHints = {},
): BlackboardAgent | undefined {
  return resolveAmbientBlackboardIdentity({ cwd, env, ...hints })?.agent
}

export function requireBlackboardAgent(
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
  hints: BlackboardAgentHints = {},
): BlackboardAgent {
  const agent = defaultBlackboardAgent(env, cwd, hints)
  if (!agent)
    throw new Error(
      'no blackboard agent identity (set CLAUDE_CODE_SESSION_ID, CURSOR_SESSION_ID, GROK_SESSION_ID, GROK_AGENT, CODEX_THREAD_ID, or pass --agent)',
    )
  return agent
}

export function requireBlackboardIdentity(options: ResolveOptions = {}): {
  agent: string
  sessionId: string
} {
  const identity = resolveAmbientBlackboardIdentity(options)
  const sessionId = options.sessionIdArg ?? identity?.sessionId
  if (!sessionId) throw new Error(MISSING_SESSION_ID_ERROR)
  if (!isValidSessionId(sessionId)) throw new Error(`invalid session id format: ${sessionId}`)
  const agent = options.agentArg ?? identity?.agent
  if (!agent)
    throw new Error(
      'no blackboard agent identity (set CLAUDE_CODE_SESSION_ID, CURSOR_SESSION_ID, GROK_SESSION_ID, GROK_AGENT, CODEX_THREAD_ID, or pass --agent)',
    )
  return { agent, sessionId }
}
