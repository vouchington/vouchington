import {
  commandsFromCodexCall,
  countStructuredFailure,
  isCodexCallOutputFailure,
} from './codex-calls.mts'
import {
  applyCommand,
  asNumber,
  asRecord,
  createEmptyFacts,
  emptyTokens,
  parseLines,
  type ParsedLine,
  type CodexOwnedSegment,
  type TokenTotals,
  type TranscriptFacts,
} from './compute-shared.mts'
import { applyCodexMessage } from './codex-messages.mts'

function codexTokenTotals(record: ParsedLine): TokenTotals | undefined {
  if (record.type !== 'event_msg') return undefined
  const payload = asRecord(record.payload)
  if (payload?.type !== 'token_count') return undefined
  const usage = asRecord(asRecord(payload.info)?.total_token_usage)
  if (!usage) return undefined
  return {
    input: asNumber(usage.input_tokens),
    output: asNumber(usage.output_tokens),
    cacheRead: asNumber(usage.cached_input_tokens),
    cacheCreation: 0,
  }
}

function addPositiveDelta(current: TokenTotals, previous: TokenTotals, totals: TokenTotals): void {
  totals.input += Math.max(0, current.input - previous.input)
  totals.output += Math.max(0, current.output - previous.output)
  totals.cacheRead += Math.max(0, current.cacheRead - previous.cacheRead)
}

function applyCall(
  payload: Record<string, unknown>,
  facts: TranscriptFacts,
  isSubagent: boolean,
  failedCallIds: Set<string>,
): void {
  if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
    facts.toolCalls++
    if (isSubagent) facts.subagentToolCalls++
    if (countStructuredFailure(payload, failedCallIds)) facts.failedToolCalls++
    for (const command of commandsFromCodexCall(payload)) applyCommand(command, facts)
  } else if (isCodexCallOutputFailure(payload) && countStructuredFailure(payload, failedCallIds)) {
    facts.failedToolCalls++
  }
}

function applyCodexRecords(
  records: ParsedLine[],
  facts: TranscriptFacts,
  isSubagent: boolean,
  failedCallIds: Set<string>,
  baseline: TokenTotals = emptyTokens(),
): void {
  let previous = baseline
  let compactedRecords = 0
  let compactedEvents = 0
  for (const record of records) {
    const payload = asRecord(record.payload)
    const isMessage = applyCodexMessage(record, payload, facts, isSubagent)
    if (record.type === 'compacted') compactedRecords++
    if (record.type === 'event_msg' && payload?.type === 'context_compacted') compactedEvents++
    if (
      record.type === 'event_msg' &&
      payload?.success === false &&
      countStructuredFailure(payload, failedCallIds)
    ) {
      facts.failedToolCalls++
    }
    const totals = codexTokenTotals(record)
    if (totals) {
      addPositiveDelta(totals, previous, isSubagent ? facts.subagentTokens : facts.tokens)
      previous = totals
    }
    if (record.type === 'response_item' && payload && !isMessage) {
      applyCall(payload, facts, isSubagent, failedCallIds)
    }
  }
  facts.compactions += Math.max(compactedRecords, compactedEvents)
}

export type CodexChildEdge = { threadId: string; agentPath: string }

// `sub_agent_activity` fires for every thread a session interacts with — parent,
// siblings, and children alike. A genuine child's `agent_path` is the owner's
// path plus exactly one segment; filtering here, before any candidate file is
// opened, keeps the "no transcript found" fail-closed error meaningful.
export function extractCodexChildEdges(
  lines: string[],
  ownerAgentPath: string,
): { edges: CodexChildEdge[] } | { error: string } {
  const base = ownerAgentPath.replace(/\/$/, '')
  const edges = new Map<string, string>()
  for (const record of parseLines(lines)) {
    const payload = asRecord(record.payload)
    if (record.type !== 'event_msg' || payload?.type !== 'sub_agent_activity') continue
    if (typeof payload.agent_thread_id !== 'string') continue
    if (typeof payload.agent_path !== 'string') {
      return {
        error: `Codex sub_agent_activity for thread ${payload.agent_thread_id} has no agent_path`,
      }
    }
    const childPath = payload.agent_path.replace(/\/$/, '')
    const isDirectChild =
      childPath.startsWith(`${base}/`) && !childPath.slice(base.length + 1).includes('/')
    if (isDirectChild) edges.set(payload.agent_thread_id, childPath)
  }
  return { edges: [...edges].map(([threadId, agentPath]) => ({ threadId, agentPath })) }
}

export type CodexRootIdentity = { threadId: string | undefined; agentPath: string }

// Root's own agent_path (top-level sessions omit it; Codex's convention is
// `/root`) and thread id, used to seed `visited` so a descendant can't rediscover
// the root.
export function readCodexRootIdentity(lines: string[]): CodexRootIdentity {
  const sessionMeta = parseLines(lines.filter(line => line.trim()).slice(0, 1))[0]
  const payload = asRecord(sessionMeta?.payload)
  return {
    threadId: typeof payload?.id === 'string' ? payload.id : undefined,
    agentPath: typeof payload?.agent_path === 'string' ? payload.agent_path : '/root',
  }
}

function hasInheritedParent(sessionMeta: ParsedLine): boolean {
  const payload = asRecord(sessionMeta.payload)
  return (
    asRecord(asRecord(payload?.source)?.subagent) !== undefined ||
    typeof payload?.forked_from_id === 'string' ||
    typeof payload?.parent_thread_id === 'string' ||
    (typeof payload?.id === 'string' &&
      typeof payload.session_id === 'string' &&
      payload.id !== payload.session_id)
  )
}

function taskStartedSeconds(record: ParsedLine): number | undefined {
  if (record.type !== 'event_msg') return undefined
  const payload = asRecord(record.payload)
  if (payload?.type !== 'task_started' || typeof payload.started_at !== 'number') return undefined
  return payload.started_at >= 1_000_000_000_000 ? payload.started_at / 1000 : payload.started_at
}

export function segmentCodexChild(
  childLines: string[],
): { inherited: boolean; segment: CodexOwnedSegment } | { error: string } {
  const child = childLines.filter(line => line.trim())
  const sessionMeta = parseLines(child.slice(0, 1))[0]
  if (sessionMeta?.type !== 'session_meta') return { error: 'Codex child has no session metadata' }
  if (!hasInheritedParent(sessionMeta)) {
    return { inherited: false, segment: { lines: child.slice(1), baseline: emptyTokens() } }
  }
  const timestamp = asRecord(sessionMeta.payload)?.timestamp
  const timestampMs = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN
  if (!Number.isFinite(timestampMs)) return { error: 'Codex child has invalid session timestamp' }
  const sessionSeconds = Math.floor(timestampMs / 1000)
  const ownedIndex = child.findIndex((line, index) => {
    if (index === 0) return false
    const record = parseLines([line])[0]
    const startedAt = record ? taskStartedSeconds(record) : undefined
    return startedAt !== undefined && startedAt >= sessionSeconds
  })
  if (ownedIndex === -1) return { error: 'Codex child has no owned task boundary' }
  let baseline = emptyTokens()
  for (const record of parseLines(child.slice(1, ownedIndex))) {
    baseline = codexTokenTotals(record) ?? baseline
  }
  return { inherited: true, segment: { lines: child.slice(ownedIndex), baseline } }
}

export function computeCodex(
  records: ParsedLine[],
  subagents: CodexOwnedSegment[],
  mainBaseline: TokenTotals = emptyTokens(),
): TranscriptFacts {
  const facts = createEmptyFacts()
  const failedCallIds = new Set<string>()
  applyCodexRecords(records, facts, false, failedCallIds, mainBaseline)
  for (const child of subagents) {
    applyCodexRecords(parseLines(child.lines), facts, true, failedCallIds, child.baseline)
  }
  return facts
}
