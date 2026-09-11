import { asRecord } from './compute-shared.mts'
import { extractCommandArg } from './exec-program-args.mts'

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

function findEmbeddedExecCommands(source: string): string[] {
  const marker = 'tools.exec_command('
  const commands: string[] = []
  let quote: '"' | "'" | '`' | undefined
  let escaped = false
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = undefined
      index++
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      index++
      continue
    }
    if (!source.startsWith(marker, index)) {
      index++
      continue
    }
    let objectStart = index + marker.length
    while (/\s/.test(source[objectStart] ?? '')) objectStart++
    if (source[objectStart] !== '{') {
      index += marker.length
      continue
    }
    // Tracks all three quote types (not just `"`), matching the outer scan above — a
    // single- or backtick-quoted value containing a brace (an `rg` pattern argument,
    // say) would otherwise mis-balance the object before extraction is even reached.
    let depth = 0
    let objectQuote: '"' | "'" | '`' | undefined
    let objectEscaped = false
    let objectEnd = objectStart
    for (; objectEnd < source.length; objectEnd++) {
      const objectChar = source[objectEnd]
      if (objectQuote) {
        if (objectEscaped) objectEscaped = false
        else if (objectChar === '\\') objectEscaped = true
        else if (objectChar === objectQuote) objectQuote = undefined
        continue
      }
      if (objectChar === '"' || objectChar === "'" || objectChar === '`') objectQuote = objectChar
      else if (objectChar === '{') depth++
      else if (objectChar === '}' && --depth === 0) break
    }
    if (depth !== 0) {
      index += marker.length
      continue
    }
    const command = extractCommandArg(source.slice(objectStart, objectEnd + 1))
    if (command) commands.push(command)
    index = objectEnd + 1
  }
  return commands
}

export function commandsFromCodexCall(payload: Record<string, unknown>): string[] {
  if (payload.name === 'exec' && payload.type === 'custom_tool_call') {
    return typeof payload.input === 'string' ? findEmbeddedExecCommands(payload.input) : []
  }
  const command = directCommand(payload)
  return command ? [command] : []
}

function isStructuredFailure(payload: Record<string, unknown>): boolean {
  return payload.status === 'failed' || payload.is_error === true || payload.success === false
}

export function countStructuredFailure(
  payload: Record<string, unknown>,
  failedCallIds: Set<string>,
): boolean {
  if (!isStructuredFailure(payload)) return false
  const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined
  if (callId) {
    if (failedCallIds.has(callId)) return false
    failedCallIds.add(callId)
  }
  return true
}

export function isCodexCallOutputFailure(payload: Record<string, unknown>): boolean {
  return (
    (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') &&
    isStructuredFailure(payload)
  )
}
