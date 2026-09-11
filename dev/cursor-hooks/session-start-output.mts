import { isRecord } from '../codex-hooks/policy/core.mts'

export function additionalContextFromHookStdout(stdout: string): string {
  const trimmed = stdout.trim()
  if (trimmed === '') return ''
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!isRecord(parsed)) return trimmed
    if (typeof parsed.additional_context === 'string' && parsed.additional_context !== '') {
      return parsed.additional_context
    }
    const nested = parsed.hookSpecificOutput
    if (
      isRecord(nested) &&
      typeof nested.additionalContext === 'string' &&
      nested.additionalContext !== ''
    ) {
      return nested.additionalContext
    }
  } catch {
    return trimmed
  }
  return ''
}

export function cursorSessionStartResponse(sessionId: string, contexts: string[]): string {
  const additional_context = contexts.filter(context => context !== '').join('\n\n')
  const output: { additional_context?: string; env?: Record<string, string> } = {}
  if (additional_context !== '') output.additional_context = additional_context
  if (sessionId !== '') output.env = { CURSOR_SESSION_ID: sessionId }
  return JSON.stringify(output)
}
