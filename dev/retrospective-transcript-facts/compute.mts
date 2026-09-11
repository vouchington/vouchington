import { computeClaude } from './compute-claude.mts'
import {
  computeCodex,
  extractCodexChildEdges,
  readCodexRootIdentity,
  segmentCodexChild,
} from './compute-codex.mts'
import {
  createEmptyFacts,
  parseLines,
  type CodexOwnedSegment,
  type TokenTotals,
  type TranscriptFacts,
} from './compute-shared.mts'

export type { CodexOwnedSegment, TokenTotals, TranscriptFacts } from './compute-shared.mts'
export { extractCodexChildEdges, readCodexRootIdentity, segmentCodexChild }

export type TranscriptSchema = 'claude' | 'codex'
export type SchemaDetection = { schema: TranscriptSchema } | { error: string }

function areCodexOwnedSegments(
  subagents: Array<string[] | CodexOwnedSegment>,
): subagents is CodexOwnedSegment[] {
  return subagents.every(subagent => !Array.isArray(subagent))
}

function recordSchema(record: Record<string, unknown>): TranscriptSchema | undefined {
  if (record.type === 'user' || record.type === 'assistant') return 'claude'
  if (
    record.type === 'session_meta' ||
    record.type === 'event_msg' ||
    record.type === 'response_item' ||
    record.type === 'turn_context' ||
    record.type === 'compacted' ||
    record.type === 'inter_agent_communication_metadata'
  ) {
    return 'codex'
  }
  return undefined
}

export function detectTranscriptSchema(lines: string[]): SchemaDetection {
  if (!lines.some(line => line.trim())) return { error: 'empty transcript' }
  const records = parseLines(lines)
  if (records.length === 0) return { error: 'transcript contains no valid JSON records' }
  const schemas = new Set<TranscriptSchema>()
  for (const record of records) {
    const schema = recordSchema(record)
    if (schema) schemas.add(schema)
  }
  if (schemas.size > 1) return { error: 'mixed Claude and Codex transcript schemas' }
  const schema = schemas.values().next().value
  if (!schema) return { error: 'unsupported transcript schema' }
  return { schema }
}

export function computeTranscriptFacts(
  lines: string[],
  subagents: Array<string[] | CodexOwnedSegment> = [],
  mainCodexBaseline?: TokenTotals,
): TranscriptFacts {
  const detection = detectTranscriptSchema(lines)
  if ('error' in detection) return createEmptyFacts()
  const records = parseLines(lines)
  if (detection.schema === 'claude') {
    const subagentRecords = subagents.flatMap(subagent =>
      parseLines(Array.isArray(subagent) ? subagent : subagent.lines),
    )
    return computeClaude([...records, ...subagentRecords])
  }
  if (!areCodexOwnedSegments(subagents)) {
    throw new TypeError('Codex subagents must be segmented before facts are computed')
  }
  return computeCodex(records, subagents, mainCodexBaseline)
}
