import { asRecord } from '../retrospective-transcript-facts/compute-shared.mts'
import { isGitMetadataPermissionDenial } from './git-metadata-denial.mts'
import type { CodexSandboxFailureRecord } from './types.mts'
import { appendBounded, emptyRawRetention, truncateRawText, type RawRetention } from './limits.mts'

// Mirrors the JSON.parse/try-catch structure of directCommand in
// dev/retrospective-transcript-facts/codex-calls.mts (a sibling extractor here, not a
// modification of that file — this one targets a normalized CommandExecution's
// `command` field, a different signal than that file's command-text extraction). Unlike
// directCommand, which only accepts a string `command`, this must also accept the
// array-shaped form: real Codex CommandExecution items observed on this machine carry
// `command` as `["bash", "-lc", "<script>"]` or `["/bin/zsh", "-lc", "<script>"]` — the
// actual command text is the last string.
function commandFromArguments(command: unknown): string | undefined {
  if (typeof command === 'string') return command
  if (Array.isArray(command)) {
    for (let index = command.length - 1; index >= 0; index -= 1) {
      if (typeof command[index] === 'string') return command[index]
    }
  }
  // No sample on this machine had any other shape (e.g. a bare single-string exec
  // form). Skip rather than guess at an untested shape.
  return undefined
}

function commandFromExecution(item: Record<string, unknown>): string | undefined {
  const direct = commandFromArguments(item.command)
  if (direct !== undefined) return direct
  if (!Array.isArray(item.parsed_cmd)) return undefined
  for (const parsed of item.parsed_cmd) {
    const record = asRecord(parsed)
    if (typeof record?.cmd === 'string') return record.cmd
  }
  return undefined
}

function outputFromExecution(item: Record<string, unknown>): string {
  if (typeof item.aggregated_output === 'string' && item.aggregated_output.length > 0) {
    return item.aggregated_output
  }
  return [item.stdout, item.stderr]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
}

function recordSandboxFailure(
  payload: Record<string, unknown>,
  sandboxFailures: CodexSandboxFailureRecord[],
  retention: RawRetention,
): void {
  if (payload.type !== 'item_completed') return
  const item = asRecord(payload.item)
  if (!item || item.type !== 'CommandExecution') return
  const command = commandFromExecution(item)
  const errorText = outputFromExecution(item)
  if (!isGitMetadataPermissionDenial(command, errorText)) return
  appendBounded(
    sandboxFailures,
    {
      source: 'codex',
      kind: 'worktree-denial',
      command: command ? truncateRawText(command, retention, 'command') : undefined,
      errorText: truncateRawText(errorText, retention, 'error'),
    },
    retention,
  )
}

export type CodexExtraction = {
  sandboxFailures: CodexSandboxFailureRecord[]
  rawRetention: RawRetention
}

export type CodexRecordExtractor = {
  pushLine: (line: string) => void
  result: () => CodexExtraction
}

export function createCodexRecordExtractor(): CodexRecordExtractor {
  const sandboxFailures: CodexSandboxFailureRecord[] = []
  const rawRetention = emptyRawRetention()
  return {
    pushLine(line) {
      if (!line.trim()) return
      try {
        const record = asRecord(JSON.parse(line))
        const payload = asRecord(record?.payload)
        if (record?.type === 'event_msg' && payload)
          recordSandboxFailure(payload, sandboxFailures, rawRetention)
      } catch {
        // A partially written final line must not hide earlier records.
      }
    },
    result: () => {
      const result = { sandboxFailures, rawRetention }
      Object.defineProperty(result, 'rawRetention', { enumerable: false, value: rawRetention })
      return result
    },
  }
}

export function extractCodexRecords(lines: string[]): CodexExtraction {
  const extractor = createCodexRecordExtractor()
  for (const line of lines) extractor.pushLine(line)
  return extractor.result()
}
