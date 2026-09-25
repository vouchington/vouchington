import { readFileSync } from 'node:fs'
import type { HookPayload } from './types.mts'

export type PreToolUseRuntime = 'claude' | 'codex' | 'grok'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readHookPayload(stdin = readFileSync(0, 'utf8')): HookPayload {
  if (stdin.trim() === '') {
    return {}
  }

  try {
    return JSON.parse(stdin) as HookPayload
  } catch {
    return {}
  }
}

export function isGrokHookProcess(env: NodeJS.ProcessEnv = process.env): boolean {
  // GROK_AGENT is deliberately not a signal here: it is a shell-level marker that could be
  // exported in a Claude or Codex session, where {decision: deny} has no defined meaning.
  return Boolean(env.GROK_SESSION_ID || env.GROK_HOOK_EVENT)
}

export function resolvePreToolUseRuntime(
  argvRuntime: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): PreToolUseRuntime | undefined {
  if (isGrokHookProcess(env)) return 'grok'
  if (argvRuntime === 'claude' || argvRuntime === 'codex' || argvRuntime === 'grok') {
    return argvRuntime
  }
  return undefined
}

export function hookToolInput(payload: HookPayload): Record<string, unknown> | undefined {
  if (isRecord(payload.tool_input)) return payload.tool_input
  if (isRecord(payload.toolInput)) return payload.toolInput
  return undefined
}

export function extractToolCommand(payload: HookPayload): string {
  const toolInput = hookToolInput(payload)
  if (toolInput && typeof toolInput.command === 'string') return toolInput.command
  if (typeof payload.command === 'string') return payload.command
  return ''
}

export function hookToolName(payload: HookPayload): string {
  for (const value of [payload.tool_name, payload.toolName]) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

export function hookSessionId(payload: HookPayload): string {
  for (const value of [payload.session_id, payload.sessionId]) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

export function hookFilePath(payload: HookPayload): string {
  if (typeof payload.file_path === 'string' && payload.file_path !== '') return payload.file_path
  if (typeof payload.filePath === 'string' && payload.filePath !== '') return payload.filePath
  const toolInput = hookToolInput(payload)
  if (!toolInput) return ''
  for (const key of ['file_path', 'filePath', 'path'] as const) {
    const value = toolInput[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return ''
}
