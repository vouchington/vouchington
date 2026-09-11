import { asRecord } from '../retrospective-transcript-facts/compute-shared.mts'
import type { ClaudeEscalationRecord } from './types.mts'
import {
  appendBounded,
  MAX_PENDING_CLAUDE_TOOL_USE_BYTES,
  MAX_PENDING_CLAUDE_TOOL_USES,
  truncateRawText,
  type RawRetention,
} from './limits.mts'

export type ToolUseInfo = { name: string; command?: string; bytes: number }

export function recordClaudeToolUse(
  block: unknown,
  toolUses: Map<string, ToolUseInfo>,
  escalations: ClaudeEscalationRecord[],
  retention: RawRetention,
  pendingBytes: { value: number },
): void {
  const value = asRecord(block)
  if (!value || (value.type !== 'tool_use' && value.type !== 'server_tool_use')) return
  const id = typeof value.id === 'string' ? value.id : undefined
  const name = typeof value.name === 'string' ? value.name : undefined
  if (!id || !name) return
  const input = asRecord(value.input)
  const command = typeof input?.command === 'string' ? input.command : undefined
  const retainedCommand = command ? truncateRawText(command, retention, 'command') : undefined
  const bytes =
    Buffer.byteLength(id) + Buffer.byteLength(name) + Buffer.byteLength(retainedCommand ?? '')
  const existing = toolUses.get(id)
  if (existing) {
    toolUses.delete(id)
    pendingBytes.value -= existing.bytes
  }
  if (bytes > MAX_PENDING_CLAUDE_TOOL_USE_BYTES) {
    retention.pendingToolUsesDropped++
    retention.pendingToolUseBytesDropped += bytes
    if (name === 'Bash' && command && input?.dangerouslyDisableSandbox === true) {
      appendBounded(escalations, { source: 'claude', command: retainedCommand! }, retention)
    }
    return
  }
  while (
    toolUses.size >= MAX_PENDING_CLAUDE_TOOL_USES ||
    pendingBytes.value + bytes > MAX_PENDING_CLAUDE_TOOL_USE_BYTES
  ) {
    const oldest = toolUses.keys().next().value
    if (oldest === undefined) break
    const evicted = toolUses.get(oldest)!
    toolUses.delete(oldest)
    pendingBytes.value -= evicted.bytes
    retention.pendingToolUsesDropped++
    retention.pendingToolUseBytesDropped += evicted.bytes
  }
  toolUses.set(id, { name, command: retainedCommand, bytes })
  pendingBytes.value += bytes
  if (name === 'Bash' && command && input?.dangerouslyDisableSandbox === true) {
    appendBounded(escalations, { source: 'claude', command: retainedCommand! }, retention)
  }
}
