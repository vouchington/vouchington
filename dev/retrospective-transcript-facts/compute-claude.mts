import {
  applyCommand,
  asArray,
  asNumber,
  asRecord,
  createEmptyFacts,
  type ParsedLine,
  type TokenTotals,
  type TranscriptFacts,
} from './compute-shared.mts'

function applyClaudeBlock(
  block: unknown,
  facts: TranscriptFacts,
  isSidechain: boolean,
  advisorIds: Set<string>,
): void {
  const value = asRecord(block)
  if (!value) return
  if (value.type === 'tool_use' || value.type === 'server_tool_use') {
    facts.toolCalls++
    if (isSidechain) facts.subagentToolCalls++
    if (value.name === 'advisor' && typeof value.id === 'string') advisorIds.add(value.id)
    if (value.name === 'Bash' || value.name === 'bash') {
      const command = asRecord(value.input)?.command
      if (typeof command === 'string') applyCommand(command, facts)
    }
  } else if (value.type === 'tool_result' && value.is_error === true) {
    facts.failedToolCalls++
  } else if (value.type === 'advisor_tool_result' && typeof value.tool_use_id === 'string') {
    advisorIds.add(value.tool_use_id)
  }
}

function addClaudeUsage(usage: Record<string, unknown> | undefined, totals: TokenTotals): void {
  if (!usage) return
  totals.input += asNumber(usage.input_tokens)
  totals.output += asNumber(usage.output_tokens)
  totals.cacheRead += asNumber(usage.cache_read_input_tokens)
  totals.cacheCreation += asNumber(usage.cache_creation_input_tokens)
}

export function computeClaude(records: ParsedLine[]): TranscriptFacts {
  const facts = createEmptyFacts()
  const advisorIds = new Set<string>()
  const seenUuids = new Set<string>()
  for (const record of records) {
    if (typeof record.uuid === 'string') {
      if (seenUuids.has(record.uuid)) continue
      seenUuids.add(record.uuid)
    }
    const isSidechain = record.isSidechain === true
    const message = asRecord(record.message)
    if (!isSidechain && record.type === 'user' && record.isCompactSummary === true) {
      facts.compactions++
    }
    if (
      !isSidechain &&
      record.type === 'user' &&
      typeof message?.content === 'string' &&
      record.isMeta !== true
    ) {
      facts.userPrompts++
    }
    if (record.type === 'assistant') {
      if (!isSidechain) facts.assistantResponses++
      addClaudeUsage(asRecord(message?.usage), isSidechain ? facts.subagentTokens : facts.tokens)
    }
    for (const block of asArray(message?.content)) {
      applyClaudeBlock(block, facts, isSidechain, advisorIds)
    }
  }
  facts.advisorCalls = advisorIds.size
  return facts
}
