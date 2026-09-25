import { isRecord } from '../codex-hooks/policy/core.mts'
import { hookFilePath } from '../codex-hooks/hook-payload.mts'
import type { HookPayload } from '../codex-hooks/types.mts'

export function cursorEditedFilePath(payload: HookPayload): string {
  if (typeof payload.file_path === 'string' && payload.file_path !== '') return payload.file_path
  if (typeof payload.filePath === 'string' && payload.filePath !== '') return payload.filePath
  return hookFilePath(payload)
}

export function remapCursorPostToolPayload(payload: HookPayload): HookPayload {
  const rawName = payload.tool_name ?? payload.toolName
  const mappedName = rawName === 'Shell' || rawName === 'shell' ? 'Bash' : rawName
  const toolInput = isRecord(payload.tool_input)
    ? payload.tool_input
    : isRecord(payload.toolInput)
      ? payload.toolInput
      : undefined
  const command =
    (toolInput && typeof toolInput.command === 'string' ? toolInput.command : undefined) ??
    (typeof payload.command === 'string' ? payload.command : undefined)
  const exitCode = cursorToolExitCode(payload)

  return {
    ...payload,
    tool_name: mappedName,
    tool_input: {
      ...(toolInput ?? {}),
      ...(command !== undefined ? { command } : {}),
    },
    ...(exitCode === undefined ? {} : { tool_response: { exit_code: exitCode } }),
  }
}

function cursorToolExitCode(payload: HookPayload): number | undefined {
  if (isRecord(payload.tool_response) && typeof payload.tool_response.exit_code === 'number') {
    return payload.tool_response.exit_code
  }
  const raw = payload.tool_output
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed) && typeof parsed.exitCode === 'number') return parsed.exitCode
    } catch {
      return undefined
    }
  }
  if (isRecord(raw) && typeof raw.exitCode === 'number') return raw.exitCode
  return undefined
}
