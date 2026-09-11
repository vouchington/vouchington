import {
  commandsFromCodexCall,
  countStructuredFailure,
  isCodexCallOutputFailure,
} from './codex-calls.mts'
import { applyCodexMessage } from './codex-messages.mts'
import {
  applyCommand,
  asArray,
  asNumber,
  asRecord,
  createEmptyFacts,
  emptyTokens,
  type ParsedLine,
  type TokenTotals,
  type TranscriptFacts,
} from './compute-shared.mts'
import { FileBackedSet } from './file-backed-set.mts'
import { openTranscriptLines } from './transcript-lines.mts'

export type StreamFactsResult = { facts: TranscriptFacts } | { error: string }
export type StreamFactsOptions = { tempRoot?: string }
const CODEX_RECORD_TYPES =
  ',session_meta,event_msg,response_item,turn_context,compacted,inter_agent_communication_metadata,'

function parse(line: string): ParsedLine | undefined {
  if (!line.trim()) return undefined
  try {
    return asRecord(JSON.parse(line))
  } catch {
    return undefined
  }
}

function schema(record: ParsedLine): 'claude' | 'codex' | undefined {
  if (record.type === 'user' || record.type === 'assistant') return 'claude'
  if (CODEX_RECORD_TYPES.includes(`,${String(record.type)},`)) return 'codex'
  return undefined
}

function addUsage(usage: Record<string, unknown> | undefined, totals: TokenTotals): void {
  if (!usage) return
  totals.input += asNumber(usage.input_tokens)
  totals.output += asNumber(usage.output_tokens)
  totals.cacheRead += asNumber(usage.cache_read_input_tokens)
  totals.cacheCreation += asNumber(usage.cache_creation_input_tokens)
}

async function applyClaude(
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

async function applyCodex(
  record: ParsedLine,
  facts: TranscriptFacts,
  failedIds: FileBackedSet,
  state: { previous: TokenTotals; compacted: number; events: number },
): Promise<void> {
  const payload = asRecord(record.payload)
  const isMessage = applyCodexMessage(record, payload, facts, false)
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

async function uniqueFailure(
  payload: Record<string, unknown>,
  failedIds: FileBackedSet,
): Promise<boolean> {
  const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined
  if (!callId) return countStructuredFailure(payload, new Set<string>())
  if (payload.status !== 'failed' && payload.is_error !== true && payload.success !== false)
    return false
  return failedIds.add(callId)
}
export async function computeTranscriptFactsFromFiles(
  mainPath: string,
  subagentPaths: string[] = [],
  options: StreamFactsOptions = {},
): Promise<StreamFactsResult> {
  const [uuids, advisors, failedIds] = await FileBackedSet.createMany(
    ['uuids', 'advisors', 'failed-calls'].map(name => `transcript-facts-${name}`),
    options.tempRoot,
  )
  try {
    const facts = createEmptyFacts()
    let detected: 'claude' | 'codex' | undefined
    let valid = 0
    const codex = { previous: emptyTokens(), compacted: 0, events: 0 }
    for (const path of [mainPath, ...subagentPaths]) {
      // eslint-disable-next-line no-await-in-loop
      const opened = await openTranscriptLines(path)
      if ('error' in opened) return opened
      // eslint-disable-next-line no-await-in-loop
      for await (const line of opened.lines) {
        const record = parse(line)
        if (!record) continue
        valid++
        const next = schema(record)
        if (next && detected && next !== detected)
          return { error: 'mixed Claude and Codex transcript schemas' }
        detected ??= next
        if (detected === 'claude') await applyClaude(record, facts, uuids, advisors)
        else if (detected === 'codex') await applyCodex(record, facts, failedIds, codex)
      }
    }
    if (valid === 0) return { error: 'empty transcript' }
    if (!detected) return { error: 'unsupported transcript schema' }
    if (detected === 'codex') facts.compactions = Math.max(codex.compacted, codex.events)
    return { facts }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    await Promise.all([uuids.dispose(), advisors.dispose(), failedIds.dispose()])
  }
}
