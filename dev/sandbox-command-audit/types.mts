import type { RawRetention } from './limits.mts'

// Shared record shapes produced by scan.mts's extractors and consumed by
// classify.mts/report.mts. See dev/sandbox-command-audit.mts for the CLI entry point
// and .agents/skills/retrospective/sandbox-audit.md for what each bucket means.

export type ClaudeToolDenialKind = 'user-rejected' | 'permission-rule' | 'automode-blocked'

// A Claude Bash tool_use with `input.dangerouslyDisableSandbox: true`. `command` is
// always present — the tool_use itself carries it, there's nothing to correlate.
export type ClaudeEscalationRecord = {
  source: 'claude'
  command: string
}

// A Claude tool_result with a top-level `toolDenialKind`. `command` is undefined only
// if the originating tool_use couldn't be correlated (missing/unmatched tool_use_id) —
// see extractClaudeRecords in claude-extract.mts.
export type ClaudeDenialRecord = {
  source: 'claude'
  kind: ClaudeToolDenialKind
  command?: string
}

// A Claude Bash tool_result with `is_error: true` whose text matched a known
// sandbox/permission failure signature (see classifyFailureText in claude-extract.mts).
// 'worktree-denial' is a distinct signal from 'genuine': it means the sandbox's
// write-path config needs fixing, not that the command needs an allowlist entry —
// see classify.mts's worktreeDenialCount and sandbox-audit.md.
export type ClaudeSandboxFailureRecord = {
  source: 'claude'
  kind: 'e2big' | 'genuine' | 'worktree-denial'
  command?: string
  errorText: string
}

// Per-source counts for files dropped by repo scoping (see repo-scope.mts) — never
// silent: report.mts surfaces both on a dedicated scope line so a future cross-repo
// leak (the root cause of #9406) is visible in the report instead of hidden in a cap.
export type SkipCounts = { claude: number; codex: number }

// A normalized Codex CommandExecution whose Git metadata path and adjacent
// permission token matched the shared conservative classifier. Raw command/output
// stay on ScanResult and therefore only cross the report boundary under --raw.
export type CodexSandboxFailureRecord = {
  source: 'codex'
  kind: 'worktree-denial'
  command?: string
  errorText: string
}

export type ScanResult = {
  claudeEscalations: ClaudeEscalationRecord[]
  claudeDenials: ClaudeDenialRecord[]
  claudeSandboxFailures: ClaudeSandboxFailureRecord[]
  codexSandboxFailures: CodexSandboxFailureRecord[]
  claudeFilesScanned: number
  codexFilesScanned: number
  readErrors: string[]
  // The repo roots discovery was scoped to for this run — see resolveRepoRoots in
  // repo-scope.mts.
  repoRoots: string[]
  skippedOtherRepo: SkipCounts
  skippedUnknownCwd: SkipCounts
  // Raw values exist solely for `--raw`; all caps are surfaced in the normal report
  // so a bounded run cannot look complete.
  rawRetention: RawRetention
}

export function emptyScanResult(): ScanResult {
  return {
    claudeEscalations: [],
    claudeDenials: [],
    claudeSandboxFailures: [],
    codexSandboxFailures: [],
    claudeFilesScanned: 0,
    codexFilesScanned: 0,
    readErrors: [],
    repoRoots: [],
    skippedOtherRepo: { claude: 0, codex: 0 },
    skippedUnknownCwd: { claude: 0, codex: 0 },
    rawRetention: {
      commandTextsTruncated: 0,
      errorTextsTruncated: 0,
      pendingToolUsesDropped: 0,
      pendingToolUseBytesDropped: 0,
      recordsDropped: 0,
      rawBytesDropped: 0,
      retainedRawBytes: 0,
    },
  }
}
