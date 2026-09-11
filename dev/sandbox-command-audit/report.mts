import type {
  BlockCandidate,
  CategorizedAudit,
  GenuineBypassCandidate,
  PrefixCount,
} from './classify.mts'
import type { ScanResult } from './types.mts'

export type ReportOptions = { json?: boolean; raw?: boolean }

export const HEADER = '=== Sandbox Command Audit ==='

// This is the privacy boundary: default (non-raw) rendering only ever touches
// normalized prefix + count fields off CategorizedAudit — never the full command/error
// text that lives on ScanResult. CategorizedAudit itself
// structurally can't carry a raw read-error path (readErrorCount is a number, not the
// string[] on ScanResult — see classify.mts), so this holds for --json output too, not
// just formatMarkdown. See formatRaw for the one path that intentionally crosses this
// line, gated behind --raw.
function prefixLines(entries: PrefixCount[]): string[] {
  return entries.length > 0
    ? entries.map(entry => `  - ${entry.prefix} (${entry.count})`)
    : ['  (none)']
}

function genuineLines(entries: GenuineBypassCandidate[]): string[] {
  return entries.length > 0
    ? entries.map(
        entry =>
          `  - ${entry.prefix} (${entry.count})${entry.alreadyInAllowList ? ' [already in permissions.allow]' : ''}`,
      )
    : ['  (none)']
}

function blockLines(entries: BlockCandidate[]): string[] {
  return entries.length > 0
    ? entries.map(
        entry =>
          `  - ${entry.prefix} (${entry.count})${entry.alreadyDenied ? ' [already in permissions.deny]' : ''}`,
      )
    : ['  (none)']
}

function unresolvedNote(count: number): string[] {
  return count > 0 ? [`  (+${count} with an unresolved command — rerun with --raw to inspect)`] : []
}

// Shared by formatMarkdown and formatRaw: names the repo scope discovery ran under and
// what got dropped for falling outside it, so a future cross-repo leak (the root cause
// of #9406) shows up in the report instead of hiding in an unexplained low file count.
type ScopeInfo = {
  repoRoots: string[]
  claudeFilesScanned: number
  codexFilesScanned: number
  skippedOtherRepo: { claude: number; codex: number }
  skippedUnknownCwd: { claude: number; codex: number }
}

function scopeLine(info: ScopeInfo): string {
  const [primaryRoot, ...worktreeRoots] = info.repoRoots
  const root = primaryRoot ?? '(no repo root resolved)'
  const worktreeSuffix =
    worktreeRoots.length > 0
      ? ` (+${worktreeRoots.length} worktree${worktreeRoots.length === 1 ? '' : 's'})`
      : ''
  const otherRepo = info.skippedOtherRepo.claude + info.skippedOtherRepo.codex
  const unknownCwd = info.skippedUnknownCwd.claude + info.skippedUnknownCwd.codex
  const skipParts = [
    otherRepo > 0 ? `${otherRepo} skipped (other repo)` : undefined,
    unknownCwd > 0 ? `${unknownCwd} skipped (cwd unknown)` : undefined,
  ].filter((part): part is string => part !== undefined)
  const skipSuffix = skipParts.length > 0 ? `; ${skipParts.join(', ')}` : ''
  return `Scope: ${root}${worktreeSuffix} — ${info.claudeFilesScanned} Claude / ${info.codexFilesScanned} Codex files scanned${skipSuffix}`
}

export function formatMarkdown(categorized: CategorizedAudit): string {
  const pressure = categorized.escalationPressure
  const lines = [
    HEADER,
    scopeLine(categorized),
    '',
    '## 1. Genuine bypass candidates (real permission/access failures, not E2BIG)',
    ...genuineLines(categorized.genuineBypassCandidates),
    ...unresolvedNote(categorized.genuineBypassUnresolvedCount),
    '',
    '## 2. Block candidates (human explicitly rejected the command)',
    ...blockLines(categorized.blockCandidates),
    ...unresolvedNote(categorized.blockCandidateUnresolvedCount),
    '',
    '## 3. Escalation pressure (root cause — dangerouslyDisableSandbox)',
    'Claude — already covered by sandbox.excludedCommands:',
    ...prefixLines(pressure.claudeCovered),
    'Claude — NOT covered (candidates to add to sandbox.excludedCommands):',
    ...prefixLines(pressure.claudeUncovered),
    ...unresolvedNote(pressure.claudeUnresolvedCount),
    `E2BIG failures (argument-list-too-long sandbox artifact, separate root cause — not a candidate list): ${pressure.e2bigCount}`,
    '',
    `## Denial hygiene (block policy already working as intended): ${categorized.policyBlockCount}`,
    '',
    ...(categorized.worktreeDenialCount > 0
      ? [
          `## Worktree write-path denials (fix sandbox write-path config, not the allowlist): ${categorized.worktreeDenialCount}`,
          '  (rerun with --raw to inspect the denied paths)',
          '',
        ]
      : []),
    `Scanned ${categorized.claudeFilesScanned} Claude transcript file(s), ${categorized.codexFilesScanned} Codex transcript file(s).`,
    ...(categorized.readErrorCount > 0
      ? [`Read errors: ${categorized.readErrorCount} (rerun with --raw to inspect)`]
      : []),
    ...rawRetentionLines(categorized.rawRetention),
  ]
  return `${lines.join('\n')}\n`
}

function rawRetentionLines(retention?: ScanResult['rawRetention']): string[] {
  if (!retention) return []
  const count =
    retention.commandTextsTruncated +
    retention.errorTextsTruncated +
    retention.pendingToolUsesDropped +
    retention.recordsDropped
  if (count === 0) return []
  return [
    `Raw retention bounded: ${retention.commandTextsTruncated} command text(s), ${retention.errorTextsTruncated} error text(s), ${retention.pendingToolUsesDropped} pending tool use(s), ${retention.recordsDropped} record(s) truncated or dropped; ${retention.pendingToolUseBytesDropped} pending and ${retention.rawBytesDropped} raw byte(s) evicted. Aggregate output may be incomplete.`,
  ]
}

const RAW_WARNING =
  '⚠ RAW MODE — full commands and sandbox-failure text below. Local inspection only. Never paste this section into a retro (privacy boundary).'

// The one intentional crossing of the privacy boundary: renders ScanResult's raw
// per-record command/failure text rather than CategorizedAudit's normalized prefixes.
// Gated behind --raw so it's never the default.
export function formatRaw(scan: ScanResult): string {
  const lines = [
    HEADER,
    scopeLine(scan),
    RAW_WARNING,
    '',
    `## Claude escalations (dangerouslyDisableSandbox) — ${scan.claudeEscalations.length}`,
    ...scan.claudeEscalations.map(record => `  - ${record.command}`),
    '',
    `## Claude denials — ${scan.claudeDenials.length}`,
    ...scan.claudeDenials.map(record => `  - [${record.kind}] ${record.command ?? '(unresolved)'}`),
    '',
    `## Claude sandbox failures — ${scan.claudeSandboxFailures.length}`,
    ...scan.claudeSandboxFailures.map(
      record => `  - [${record.kind}] ${record.command ?? '(unresolved)'}: ${record.errorText}`,
    ),
    '',
    `## Codex sandbox failures — ${scan.codexSandboxFailures.length}`,
    ...scan.codexSandboxFailures.map(
      record => `  - [${record.kind}] ${record.command ?? '(unresolved)'}: ${record.errorText}`,
    ),
    '',
    `## Read errors — ${scan.readErrors.length}`,
    ...scan.readErrors.map(error => `  - ${error}`),
  ]
  return `${lines.join('\n')}\n`
}

export function formatReport(
  scan: ScanResult,
  categorized: CategorizedAudit,
  options: ReportOptions = {},
): string {
  if (options.json) {
    return `${JSON.stringify(options.raw ? scan : categorized, null, 2)}\n`
  }
  return options.raw ? formatRaw(scan) : formatMarkdown(categorized)
}
