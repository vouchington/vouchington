import type { TranscriptFacts } from '../retrospective-transcript-facts/compute-shared.mts'
import { formatTranscriptFacts } from '../retrospective-transcript-facts/format.mts'
import { AUTO_APPEND_HEADING_PREFIX } from './checkpoint-entry.mts'
import type { MilestoneKind } from './checkpoints.mts'
import type { FailureRecord } from './failure-counter.mts'

function indent(text: string): string {
  return text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')
}

export function renderCompactNote(
  sessionId: string,
  transcriptPath: string,
  facts: TranscriptFacts,
): string {
  return [
    `${AUTO_APPEND_HEADING_PREFIX}post-compaction checkpoint`,
    '',
    `Transcript: ${transcriptPath || 'unavailable'}`,
    '',
    formatTranscriptFacts(sessionId, facts).trimEnd(),
  ].join('\n')
}

export function renderFailureNote(count: number, failures: FailureRecord[]): string {
  const entries = failures
    .map((failure, index) => `${index + 1}. \`${failure.command}\`\n${indent(failure.stderrHead)}`)
    .join('\n\n')
  return [
    `${AUTO_APPEND_HEADING_PREFIX}repeated command failure (failure #${count})`,
    '',
    `Last ${failures.length} tracked high-signal command failure(s):`,
    '',
    entries,
  ].join('\n')
}

export function renderMilestoneNote(
  command: string,
  kind: MilestoneKind,
  evidence: string,
): string {
  const label = kind === 'pr-create' ? 'PR created' : 'Pushed'
  return [
    `${AUTO_APPEND_HEADING_PREFIX}${label}`,
    '',
    `Command: \`${command}\``,
    '',
    indent(evidence),
  ].join('\n')
}
