import { inspectHarnessEnvironment } from 'vouchington-tooling/agent-harness-identity'

import {
  ambiguousSessionMessage,
  conflictingOwners,
  ownedSessions,
  resolveRootCodexSessionId,
  transcriptHarness,
} from '../agent-session-id/identity.mts'
import {
  cursorPayloadSessionId,
  grokHookSessionId,
  hookPayloadSessionId,
  readPersistedSessionId,
} from '../agent-session-id/persist.mts'
import { isValidSessionId } from '../agent-session-id/valid-id.mts'
import { resolvePreToolUseRuntime, type PreToolUseRuntime } from '../codex-hooks/hook-payload.mts'
import type { HookPayload } from '../codex-hooks/types.mts'

export type HookSessionInput = {
  cwd: string
  env: NodeJS.ProcessEnv
  // The harness token argv[2] carries (`claude`, `codex` or `grok`). It is absent when a linked
  // worktree runs the main checkout's older hook command, so the payload must stand on its own.
  harnessArg?: string
  payload: HookPayload
}

export type HookSession = {
  failure?: string
  runtime?: PreToolUseRuntime
  sessionId?: string
}

function ownEnvId(value: string | undefined): string {
  const id = value?.trim() ?? ''
  return isValidSessionId(id) ? id : ''
}

// The detected harness's own payload or env beats everything, and no other harness's env or
// persisted file is read. The ambient resolver is not used here: its fallbacks exist for Bash
// tool calls, where the hook payload is not available.
function detectedSessionId(
  runtime: PreToolUseRuntime,
  { cwd, env, payload }: HookSessionInput,
): string {
  const payloadId = hookPayloadSessionId(payload)
  switch (runtime) {
    case 'claude':
      return payloadId || ownEnvId(env.CLAUDE_CODE_SESSION_ID)
    case 'codex':
      // A child's CODEX_THREAD_ID is its own session. A root Codex has none: the payload id is
      // the thread id, persisted to .local/codex-session-id for later hook-less tools.
      return (
        ownEnvId(env.CODEX_THREAD_ID) ||
        resolveRootCodexSessionId(cwd, payloadId, false).sessionId ||
        ''
      )
    case 'grok':
      // A positive Grok signal (GROK_SESSION_ID or GROK_HOOK_EVENT) is what selected this branch.
      return grokHookSessionId(payload, env) || (readPersistedSessionId(cwd, 'grok') ?? '')
    case 'cursor':
      return (
        cursorPayloadSessionId(payload) ||
        ownEnvId(env.CURSOR_SESSION_ID) ||
        (readPersistedSessionId(cwd, 'cursor') ?? '')
      )
  }
}

// argv names the harness when the hook command passes it. Otherwise the payload's own
// transcript path does (Codex rollouts, Grok updates, Claude project transcripts). Env session
// ids never name the runtime: a harness launched from another's shell inherits them.
function detectRuntime(input: HookSessionInput): PreToolUseRuntime | undefined {
  const { env, harnessArg, payload } = input
  const transcript = typeof payload.transcript_path === 'string' ? payload.transcript_path : ''
  return resolvePreToolUseRuntime(harnessArg, env, payload) ?? transcriptHarness(transcript)
}

export function resolveHookSession(input: HookSessionInput): HookSession {
  const { env, payload } = input
  const runtime = detectRuntime(input)
  try {
    if (runtime) {
      const sessionId = detectedSessionId(runtime, input)
      return isValidSessionId(sessionId) ? { runtime, sessionId } : { runtime }
    }
    // Unknown runtime: the payload id wins, and the env is a last resort only when it names
    // a single session.
    const payloadId = hookPayloadSessionId(payload)
    if (payloadId !== '') return { sessionId: payloadId }
    const environment = inspectHarnessEnvironment(env)
    const owners = conflictingOwners(environment)
    if (owners) return { failure: ambiguousSessionMessage(owners) }
    const sessionId = ownedSessions(environment)[0]?.sessionId
    return sessionId !== undefined && isValidSessionId(sessionId) ? { sessionId } : {}
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error), runtime }
  }
}
