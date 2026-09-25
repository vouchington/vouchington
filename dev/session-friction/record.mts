#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

import { recordFriction as recordObservation } from 'vouchington-tooling/session-friction'

import {
  extractToolCommand,
  hookSessionId,
  hookToolInput,
  hookToolName,
  readHookPayload,
} from '../codex-hooks/hook-payload.mts'
import type { HookPayload } from '../codex-hooks/types.mts'
import { frictionLogDirectory } from './config.mts'

function resolveFrictionSessionId(payload: HookPayload, env: NodeJS.ProcessEnv): string {
  const fromPayload = hookSessionId(payload)
  if (fromPayload !== '') return fromPayload
  for (const name of ['CLAUDE_CODE_SESSION_ID', 'CURSOR_SESSION_ID', 'CODEX_THREAD_ID'] as const) {
    const value = env[name]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

function structuredStderr(payload: HookPayload): string | undefined {
  for (const key of ['tool_response', 'toolResponse'] as const) {
    const value = (payload as Record<string, unknown>)[key]
    if (value && typeof value === 'object' && 'stderr' in value) {
      const stderr = (value as Record<string, unknown>).stderr
      if (typeof stderr === 'string') return stderr
    }
  }
  return undefined
}

// PostToolUse hook entrypoint: captures sandbox friction (escalations, sandbox-level
// command failures) live, instead of reconstructing it at end-of-session via expensive
// transcript mining. Core logic is this directly-testable function; only stdin-reading and
// process.exit live behind the CLI guard below (established convention: see
// dev/retrospective-save.mts:64, dev/blackboard-journal.mts:65).
export function recordFriction(payload: HookPayload, env: NodeJS.ProcessEnv = process.env): void {
  const sessionId = resolveFrictionSessionId(payload, env)
  if (!sessionId) return
  const input = hookToolInput(payload)
  const escalationDetail =
    input?.dangerouslyDisableSandbox === true
      ? 'dangerouslyDisableSandbox=true'
      : input?.with_escalated_permissions === true
        ? 'with_escalated_permissions=true'
        : undefined
  recordObservation(
    sessionId,
    {
      type: 'tool-result',
      command: extractToolCommand(payload),
      escalationDetail,
      structuredStderr: structuredStderr(payload),
    },
    { directory: frictionLogDirectory(env) },
  )
}

// Codex `PermissionRequest` hook entrypoint: the event firing at all is the escalation signal
// (Codex's PostToolUse payload has no `with_escalated_permissions`/`dangerouslyDisableSandbox`
// field to key on). The hook has no `matcher`, so it also fires for non-shell approval prompts;
// `classifyPermissionRequest` returns null for those (no command to key on), in which case only
// the anti-fabrication log-file touch happens, same as a no-op PostToolUse call.
export function recordPermissionRequestFriction(
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const sessionId = resolveFrictionSessionId(payload, env)
  if (!sessionId) return
  const command = extractToolCommand(payload)
  const observation =
    hookToolName(payload) === 'Bash'
      ? { type: 'permission-request' as const, command }
      : { type: 'tool-result' as const, command }
  recordObservation(sessionId, observation, { directory: frictionLogDirectory(env) })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2]
    const payload = readHookPayload()
    if (mode === 'permission-request') {
      recordPermissionRequestFriction(payload)
    } else {
      recordFriction(payload)
    }
  } catch {
    // Fail-open by design: this hook must never block, delay, or surface noise for the
    // calling tool. Never write to stdout, always exit 0.
  }
  process.exit(0)
}
