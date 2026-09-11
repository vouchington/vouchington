/**
 * Resolves the model name for the current agent session from its transcript. No environment
 * variable carries the model, so this reuses the transcript resolution/parsing machinery from
 * `dev/retrospective-transcript-facts` rather than reimplementing JSONL discovery and parsing.
 *
 * Every failure degrades to `undefined` — missing file, unreadable file, unknown schema, no
 * matching record. The model is a nicety; PR creation must never break because a transcript moved.
 */

import { asRecord } from '../retrospective-transcript-facts/compute-shared.mts'
import {
  openTranscriptLines,
  resolveTranscriptFile,
} from '../retrospective-transcript-facts/resolve.mts'

export type Harness = 'claude-code' | 'codex' | 'cursor' | 'grok'

export type ProvenanceModelDeps = {
  resolveTranscriptFile?: typeof resolveTranscriptFile
  openTranscriptLines?: typeof openTranscriptLines
}

function schemaFor(record: Record<string, unknown>): 'claude' | 'codex' | undefined {
  if (record.type === 'user' || record.type === 'assistant') return 'claude'
  if (
    record.type === 'session_meta' ||
    record.type === 'event_msg' ||
    record.type === 'response_item' ||
    record.type === 'turn_context' ||
    record.type === 'compacted' ||
    record.type === 'inter_agent_communication_metadata'
  )
    return 'codex'
  return undefined
}

export async function resolveModelFromTranscript(
  harness: Harness,
  sessionId: string,
  deps: ProvenanceModelDeps = {},
): Promise<string | undefined> {
  if (harness === 'grok' || harness === 'cursor') return undefined

  const resolveFile = deps.resolveTranscriptFile ?? resolveTranscriptFile
  const openLines = deps.openTranscriptLines ?? openTranscriptLines

  const resolved = resolveFile({ sessionIdArg: sessionId })
  if ('error' in resolved) return undefined

  const expectedSchema = harness === 'claude-code' ? 'claude' : 'codex'
  const result = await openLines(resolved.path)
  if ('error' in result) return undefined
  let schema: 'claude' | 'codex' | undefined
  let model: string | undefined
  try {
    for await (const line of result.lines) {
      try {
        const record = asRecord(JSON.parse(line))
        if (!record) continue
        const currentSchema = schemaFor(record)
        if (!currentSchema) continue
        if (schema && schema !== currentSchema) return undefined
        schema = currentSchema
        if (schema === 'claude' && record.type === 'assistant' && record.isSidechain !== true) {
          const candidate = asRecord(record.message)?.model
          if (typeof candidate === 'string' && candidate) model = candidate
        }
        if (schema === 'codex' && record.type === 'turn_context') {
          const candidate = asRecord(record.payload)?.model
          if (typeof candidate === 'string' && candidate) model = candidate
        }
      } catch {
        // A partially written final line is not provenance.
      }
    }
  } catch {
    return undefined
  }
  return schema === expectedSchema ? model : undefined
}
