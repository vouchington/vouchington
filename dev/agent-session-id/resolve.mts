import { resolveAmbientBlackboardIdentity } from './ambient.mts'
import {
  MISSING_SESSION_ID_ERROR,
  type BlackboardAgent,
  type BlackboardAgentHints,
  type ResolveOptions,
} from './identity.mts'
import { isValidSessionId } from './valid-id.mts'

export { resolveAmbientBlackboardIdentity } from './ambient.mts'
export type { BlackboardAgent, BlackboardAgentHints, ResolveOptions } from './identity.mts'
export { validateRootCodexOptions } from './root-codex-options.mts'

const MISSING_AGENT_ERROR =
  'no blackboard agent identity (set CLAUDE_CODE_SESSION_ID, CURSOR_SESSION_ID, GROK_SESSION_ID, GROK_AGENT, CODEX_THREAD_ID, or pass --agent)'

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
  if (!agent) throw new Error(MISSING_AGENT_ERROR)
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
  if (!agent) throw new Error(MISSING_AGENT_ERROR)
  return { agent, sessionId }
}
