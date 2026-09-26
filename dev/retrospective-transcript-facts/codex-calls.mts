import { findEmbeddedExecCommands } from './codex-embedded-exec.mts'
import { asRecord } from './compute-shared.mts'

function directCommand(payload: Record<string, unknown>): string | undefined {
  if (!['exec_command', 'bash', 'shell', 'Bash'].includes(String(payload.name))) return undefined
  const raw = payload.type === 'function_call' ? payload.arguments : payload.input
  if (typeof raw !== 'string') return undefined
  try {
    const args = asRecord(JSON.parse(raw))
    const command = args?.cmd ?? args?.command
    return typeof command === 'string' ? command : undefined
  } catch {
    return payload.type === 'custom_tool_call' ? raw : undefined
  }
}

export function commandsFromCodexCall(payload: Record<string, unknown>): string[] {
  if (payload.name === 'exec' && payload.type === 'custom_tool_call') {
    return typeof payload.input === 'string' ? findEmbeddedExecCommands(payload.input) : []
  }
  const command = directCommand(payload)
  return command ? [command] : []
}

export function isStructuredFailure(payload: Record<string, unknown>): boolean {
  return payload.status === 'failed' || payload.is_error === true || payload.success === false
}

export function isCodexCallOutputFailure(payload: Record<string, unknown>): boolean {
  return (
    (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') &&
    isStructuredFailure(payload)
  )
}
