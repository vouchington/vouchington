import type { ParsedLine, TranscriptFacts } from './compute-shared.mts'

export function applyCodexMessage(
  record: ParsedLine,
  payload: Record<string, unknown> | undefined,
  facts: TranscriptFacts,
): boolean {
  if (!payload) return false

  if (record.type === 'event_msg' && payload.type === 'user_message') {
    facts.userPrompts++
    return true
  }
  if (record.type === 'event_msg' && payload.type === 'agent_message') {
    facts.assistantResponses++
    return true
  }
  if (record.type !== 'response_item' || payload.type !== 'message') return false

  if (payload.role === 'user') facts.userPrompts++
  else if (payload.role === 'assistant') facts.assistantResponses++
  else return false
  return true
}
