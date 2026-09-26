import {
  commandsFromCodexCall,
  isCodexCallOutputFailure,
  isStructuredFailure,
} from './codex-calls.mts'
import { applyCodexMessage } from './codex-messages.mts'
import {
  applyCommand,
  asNumber,
  asRecord,
  type ParsedLine,
  type TokenTotals,
  type TranscriptFacts,
} from './compute-shared.mts'
import { FileBackedSet } from './file-backed-set.mts'

function tokenTotals(record: ParsedLine): TokenTotals | undefined {
  const payload = asRecord(record.payload)
  const usage =
    record.type === 'event_msg' && payload?.type === 'token_count'
      ? asRecord(asRecord(payload.info)?.total_token_usage)
      : undefined
  return usage
    ? {
        input: asNumber(usage.input_tokens),
        output: asNumber(usage.output_tokens),
        cacheRead: asNumber(usage.cached_input_tokens),
        cacheCreation: 0,
      }
    : undefined
}

async function uniqueFailure(
  payload: Record<string, unknown>,
  failedIds: FileBackedSet,
): Promise<boolean> {
  const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined
  if (!callId) return isStructuredFailure(payload)
  if (payload.status !== 'failed' && payload.is_error !== true && payload.success !== false)
    return false
  return failedIds.add(callId)
}

export async function applyCodex(
  record: ParsedLine,
  facts: TranscriptFacts,
  failedIds: FileBackedSet,
  state: { previous: TokenTotals; compacted: number; events: number },
): Promise<void> {
  const payload = asRecord(record.payload)
  const isMessage = applyCodexMessage(record, payload, facts)
  if (record.type === 'compacted') state.compacted++
  if (record.type === 'event_msg' && payload?.type === 'context_compacted') state.events++
  if (
    record.type === 'event_msg' &&
    payload?.success === false &&
    (await uniqueFailure(payload, failedIds))
  )
    facts.failedToolCalls++
  const totals = tokenTotals(record)
  if (totals) {
    facts.tokens.input += Math.max(0, totals.input - state.previous.input)
    facts.tokens.output += Math.max(0, totals.output - state.previous.output)
    facts.tokens.cacheRead += Math.max(0, totals.cacheRead - state.previous.cacheRead)
    state.previous = totals
  }
  if (record.type === 'response_item' && payload && !isMessage) {
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      facts.toolCalls++
      if (await uniqueFailure(payload, failedIds)) facts.failedToolCalls++
      for (const command of commandsFromCodexCall(payload)) applyCommand(command, facts)
    } else if (isCodexCallOutputFailure(payload) && (await uniqueFailure(payload, failedIds)))
      facts.failedToolCalls++
  }
}
