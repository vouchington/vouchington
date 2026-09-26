import { applyClaude, applyCodex } from './compute-stream-apply.mts'
import {
  asRecord,
  createEmptyFacts,
  emptyTokens,
  type ParsedLine,
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
