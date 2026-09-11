import { tmpdir } from 'node:os'

import { openTranscriptLines } from '../retrospective-transcript-facts/resolve.mts'
import { createClaudeRecordExtractor, type ClaudeExtraction } from './claude-extract.mts'
import { scanCodexFile, type CodexFileResult } from './codex-scan.mts'
import { discoverTranscriptFiles, type DiscoverOptions } from './discover-files.mts'
import { appendBounded } from './limits.mts'
import { emptyScanResult, type ScanResult } from './types.mts'

export type { DiscoverOptions } from './discover-files.mts'
export type ScanOptions = DiscoverOptions & { tempRoot?: string }

const READ_BATCH_SIZE = 1
type ClaudeFileResult = ClaudeExtraction | { error: string }

async function scanClaudeFile(file: string): Promise<ClaudeFileResult> {
  const opened = await openTranscriptLines(file)
  if ('error' in opened) return { error: opened.error }
  const extractor = createClaudeRecordExtractor()
  try {
    for await (const line of opened.lines) extractor.pushLine(line)
    return extractor.result()
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function mergeClaude(result: ScanResult, file: string, scanned: ClaudeFileResult): void {
  if ('error' in scanned) {
    appendBounded(result.readErrors, `${file}: ${scanned.error}`, result.rawRetention)
    return
  }
  result.claudeFilesScanned++
  mergeRetention(result, scanned.rawRetention)
  for (const record of scanned.escalations)
    appendBounded(result.claudeEscalations, record, result.rawRetention)
  for (const record of scanned.denials)
    appendBounded(result.claudeDenials, record, result.rawRetention)
  for (const record of scanned.sandboxFailures)
    appendBounded(result.claudeSandboxFailures, record, result.rawRetention)
}

function mergeCodex(result: ScanResult, file: string, scanned: CodexFileResult): void {
  if ('error' in scanned) {
    appendBounded(result.readErrors, `${file}: ${scanned.error}`, result.rawRetention)
    return
  }
  result.codexFilesScanned++
  mergeRetention(result, scanned.rawRetention)
  for (const record of scanned.sandboxFailures)
    appendBounded(result.codexSandboxFailures, record, result.rawRetention)
}

function mergeRetention(result: ScanResult, retention: ScanResult['rawRetention']): void {
  result.rawRetention.commandTextsTruncated += retention.commandTextsTruncated
  result.rawRetention.errorTextsTruncated += retention.errorTextsTruncated
  result.rawRetention.pendingToolUsesDropped += retention.pendingToolUsesDropped
  result.rawRetention.pendingToolUseBytesDropped += retention.pendingToolUseBytesDropped
  result.rawRetention.recordsDropped += retention.recordsDropped
  result.rawRetention.rawBytesDropped += retention.rawBytesDropped
}

async function scanBatches<T>(
  files: string[],
  scan: (file: string) => Promise<T>,
  merge: (file: string, scanned: T) => void,
): Promise<void> {
  for (let start = 0; start < files.length; start += READ_BATCH_SIZE) {
    const batch = files.slice(start, start + READ_BATCH_SIZE)
    // Bounded batches cap in-flight streams and release per-file result arrays immediately.
    // oxlint-disable-next-line no-await-in-loop
    const scanned = await Promise.all(batch.map(scan))
    for (const [index, file] of batch.entries()) merge(file, scanned[index]!)
  }
}

export async function scanTranscripts(options: ScanOptions): Promise<ScanResult> {
  const { claudeFiles, codexFiles, skippedOtherRepo, skippedUnknownCwd } =
    await discoverTranscriptFiles(options)
  const result = emptyScanResult()
  result.repoRoots = options.repoRoots
  result.skippedOtherRepo = skippedOtherRepo
  result.skippedUnknownCwd = skippedUnknownCwd
  const tempRoot = options.tempRoot ?? tmpdir()
  await scanBatches(claudeFiles, scanClaudeFile, (file, scanned) =>
    mergeClaude(result, file, scanned),
  )
  await scanBatches(
    codexFiles,
    file => scanCodexFile(file, tempRoot),
    (file, scanned) => mergeCodex(result, file, scanned),
  )
  return result
}
