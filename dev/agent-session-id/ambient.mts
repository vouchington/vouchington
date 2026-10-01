import {
  inspectHarnessEnvironment,
  selectHarnessSession,
  type HarnessEnvironment,
} from 'vouchington-tooling/agent-harness-identity'

import {
  ambiguousSessionMessage,
  conflictingOwners,
  fromHarness,
  harnessForSessionId,
  resolveRootCodexSessionId,
  transcriptHarness,
  type BlackboardIdentity,
  type ResolveOptions,
} from './identity.mts'
import { readPersistedSessionId } from './persist.mts'
import { validateRootCodexOptions } from './root-codex-options.mts'

// A persisted file is read only on a positive signal for its harness: GROK_AGENT or CURSOR_AGENT
// is set, and not both. With no marker the file may belong to any earlier session in this
// worktree, and reading it would hand one harness another's id.
function markedPersistHarness(environment: HarnessEnvironment): 'cursor' | 'grok' | undefined {
  if (environment.grok.agentMarker === environment.cursor.agentMarker) return undefined
  return environment.grok.agentMarker ? 'grok' : 'cursor'
}

function selectAmbient(
  options: ResolveOptions,
  environment: HarnessEnvironment,
  cwd: string,
): BlackboardIdentity | undefined {
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
  const persistedHarness = markedPersistHarness(environment)
  const persisted = persistedHarness && readPersistedSessionId(cwd, persistedHarness)
  if (persistedHarness && persisted) return fromHarness(persistedHarness, persisted)
  if (environment.grok.hookEvent) return { agent: 'grok', harness: 'grok' }
  const transcript = transcriptHarness(options.transcriptPath)
  if (transcript) return fromHarness(transcript)
  if (environment.grok.agentMarker) return fromHarness('grok')
  return environment.cursor.agentMarker ? fromHarness('cursor') : undefined
}

export function resolveAmbientBlackboardIdentity(
  options: ResolveOptions = {},
): BlackboardIdentity | undefined {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  validateRootCodexOptions(options)
  const environment = inspectHarnessEnvironment(env)
  const owners = conflictingOwners(environment)
  if (options.sessionIdArg !== undefined) {
    const matched = harnessForSessionId(environment, options.sessionIdArg)
    // An explicit id is never ambiguous; when the env cannot name its owner the label is left
    // to the other hints rather than guessed from a harness that did not issue the id.
    const ambient = owners ? undefined : selectAmbient(options, environment, cwd)
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
  if (owners) {
    // A caller-supplied runtime names the owner; without one the environment cannot.
    if (!options.runtime) throw new Error(ambiguousSessionMessage(owners))
    return fromHarness(options.runtime, environment[options.runtime].sessionId)
  }
  return selectAmbient(options, environment, cwd)
}
