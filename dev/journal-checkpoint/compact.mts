import { computeTranscriptFactsFromFiles } from '../retrospective-transcript-facts/compute-stream.mts'
import {
  resolveSubagentJsonlPaths,
  resolveTranscriptFile,
} from '../retrospective-transcript-facts/resolve.mts'
import type { BlackboardAgentHints } from '../agent-session-id/resolve.mts'
import { appendCheckpoint, type BlackboardClients } from './append.mts'
import { hookSessionId, isCompactRestart, type HookPayload } from './checkpoints.mts'
import { renderCompactNote } from './note.mts'

// Checkpoint 1 (#9337): the only mechanical post-compaction journal trigger. Called from
// dev/journal-checkpoint.mts's SessionStart(compact) dispatch; re-checks isCompactRestart and the
// session id so this stays correct even when called directly (e.g. from a test) rather than only
// trusting the entry script's pre-filter.
export async function runCompactCheckpoint(
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
  clients: BlackboardClients = {},
  runtime?: BlackboardAgentHints['runtime'],
): Promise<void> {
  if (!isCompactRestart(payload)) return
  const sessionId = hookSessionId(payload)
  if (sessionId === '') return

  const transcriptPathArg =
    typeof payload.transcript_path === 'string' ? payload.transcript_path : ''
  const resolved = transcriptPathArg
    ? { path: transcriptPathArg, sessionId }
    : resolveTranscriptFile({ env, sessionIdArg: sessionId })
  if ('error' in resolved) return

  // Claude sibling transcripts are processed one at a time after the main transcript. The
  // streaming accumulator owns the file-backed UUID set, preserving resume deduplication without
  // retaining all records or identifiers in memory.
  const result = await computeTranscriptFactsFromFiles(
    resolved.path,
    resolveSubagentJsonlPaths(resolved.path),
  )
  if ('error' in result) return
  const { facts } = result
  const markdown = renderCompactNote(sessionId, resolved.path, facts)
  await appendCheckpoint({
    checkpoint: 'compaction',
    env,
    markdown,
    runtime,
    sessionId,
    transcriptPath: resolved.path,
    ...clients,
  }).catch(() => {})
}
