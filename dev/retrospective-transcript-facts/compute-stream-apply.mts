export { applyCodex, tokenTotals, uniqueFailure } from './compute-stream-codex.mts'
import {
  applyCommand,
  asArray,
  asNumber,
  asRecord,
  type ParsedLine,
  type TokenTotals,
  type TranscriptFacts,
} from './compute-shared.mts'
import { FileBackedSet } from './file-backed-set.mts'

export function addUsage(usage: Record<string, unknown> | undefined, totals: TokenTotals): void {
  if (!usage) return
  totals.input += asNumber(usage.input_tokens)
  totals.output += asNumber(usage.output_tokens)
  totals.cacheRead += asNumber(usage.cache_read_input_tokens)
  totals.cacheCreation += asNumber(usage.cache_creation_input_tokens)
}

export async function applyClaude(
  record: ParsedLine,
  facts: TranscriptFacts,
  uuids: FileBackedSet,
  advisors: FileBackedSet,
): Promise<void> {
  if (typeof record.uuid === 'string' && !(await uuids.add(record.uuid))) return
  const sidechain = record.isSidechain === true
  const message = asRecord(record.message)
  if (!sidechain && record.type === 'user' && record.isCompactSummary === true) facts.compactions++
  if (
    !sidechain &&
    record.type === 'user' &&
    typeof message?.content === 'string' &&
    record.isMeta !== true
  )
    facts.userPrompts++
  if (record.type === 'assistant') {
    if (!sidechain) facts.assistantResponses++
    addUsage(asRecord(message?.usage), sidechain ? facts.subagentTokens : facts.tokens)
  }
  for (const block of asArray(message?.content)) {
    const value = asRecord(block)
    if (!value) continue
    if (value.type === 'tool_use' || value.type === 'server_tool_use') {
      facts.toolCalls++
      if (sidechain) facts.subagentToolCalls++
      if (
        value.name === 'advisor' &&
        typeof value.id === 'string' &&
        // eslint-disable-next-line no-await-in-loop
        (await advisors.add(value.id))
      )
        facts.advisorCalls++
      if (
        (value.name === 'Bash' || value.name === 'bash') &&
        typeof asRecord(value.input)?.command === 'string'
      )
        applyCommand(asRecord(value.input)?.command as string, facts)
    } else if (value.type === 'tool_result' && value.is_error === true) facts.failedToolCalls++
    else if (
      value.type === 'advisor_tool_result' &&
      typeof value.tool_use_id === 'string' &&
      // eslint-disable-next-line no-await-in-loop
      (await advisors.add(value.tool_use_id))
    )
      facts.advisorCalls++
  }
}
