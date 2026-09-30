import {
  cursorPayloadSessionId,
  grokHookSessionId,
  hookPayloadSessionId,
} from '../agent-session-id/persist.mts'
import { resolveSessionId } from '../agent-session-id/resolve.mts'
import { isValidSessionId } from '../agent-session-id/valid-id.mts'
import { resolvePreToolUseRuntime } from '../codex-hooks/hook-payload.mts'
import type { HookPayload } from '../codex-hooks/types.mts'

export type HookSessionInput = {
  cwd: string
  env: NodeJS.ProcessEnv
  // The harness token argv[2] carries (`claude` or `codex`), as for the dev/codex-hooks hooks.
  harnessArg?: string
  payload: HookPayload
}

function payloadSessionId(
  runtime: ReturnType<typeof resolvePreToolUseRuntime>,
  payload: HookPayload,
  env: NodeJS.ProcessEnv,
): string {
  if (runtime === 'cursor') return cursorPayloadSessionId(payload)
  if (runtime === 'grok') return grokHookSessionId(payload, env)
  return hookPayloadSessionId(payload)
}

// The id agents pass as `sessionId` to the vouchington-tooling MCP tools. It is exactly what
// resolveSessionId returns for this hook, so it matches every other repository tool:
// - root Codex (no CODEX_THREAD_ID in the hook env): the payload id is the thread id, and the
//   resolver persists it to .local/codex-session-id and reads it back;
// - otherwise the ambient env / persisted id, and when there is none, the payload id as an
//   explicit sessionIdArg. A Claude hook passes its runtime so a stale .local/cursor-session-id
//   from an earlier Cursor session is never read in its place.
export function resolveHookSessionId(input: HookSessionInput): string | undefined {
  const { cwd, env, harnessArg, payload } = input
  const runtime = resolvePreToolUseRuntime(harnessArg, env, payload)
  const payloadId = payloadSessionId(runtime, payload, env)
  let sessionId: string | undefined
  if (runtime === 'codex' && !env.CODEX_THREAD_ID) {
    const rootEnv = payloadId ? { ...env, CODEX_THREAD_ID: payloadId } : env
    sessionId = resolveSessionId({ cwd, env: rootEnv, rootCodex: true })
  } else {
    const hints = runtime === 'claude' ? { runtime } : {}
    sessionId = resolveSessionId({ cwd, env, ...hints })
    if (sessionId === undefined && payloadId !== '') {
      sessionId = resolveSessionId({ cwd, env, sessionIdArg: payloadId, ...hints })
    }
  }
  return sessionId !== undefined && isValidSessionId(sessionId) ? sessionId : undefined
}
