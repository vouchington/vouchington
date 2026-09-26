import type { HookPayload } from './types.mts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Cursor runs the Claude-compat hooks from .claude/settings.json but names its shell tool `Shell`
// and reports the result as `tool_output`, a JSON string `{exitCode, output}`. Normalizing both
// to Claude's shape here means every hook (policy, tmux reminder, journal checkpoints, friction)
// reads one payload dialect. An existing `tool_response` is never overwritten.
export function normalizeCursorShellPayload(payload: HookPayload): HookPayload {
  if (payload.tool_name !== 'Shell') return payload
  const result = cursorShellResult(payload.tool_output)
  return {
    ...payload,
    tool_name: 'Bash',
    ...(result === undefined || payload.tool_response !== undefined
      ? {}
      : { tool_response: result }),
  }
}

function cursorShellResult(raw: unknown): { exit_code: number; stdout: string } | undefined {
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  if (!isRecord(parsed) || typeof parsed.exitCode !== 'number') return undefined
  return {
    exit_code: parsed.exitCode,
    stdout: typeof parsed.output === 'string' ? parsed.output : '',
  }
}

// Cursor passes `cursor_version` in every hook payload and sets CURSOR_VERSION/CURSOR_PROJECT_DIR
// in the hook env. It also inherits CLAUDE_CODE_SESSION_ATTENDED when launched from a Claude
// session, so it must resolve before argv `claude` is trusted. The env names only override
// `claude` (the Claude-compat config Cursor runs), never Codex's own `codex`.
export function isCursorHookProcess(
  argvRuntime: string | undefined,
  env: NodeJS.ProcessEnv,
  payload: HookPayload,
): boolean {
  return (
    argvRuntime === 'claude' &&
    (typeof payload.cursor_version === 'string' ||
      Boolean(env.CURSOR_VERSION || env.CURSOR_PROJECT_DIR))
  )
}
