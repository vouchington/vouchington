import {
  groupByPrefix,
  splitByCoverage,
  toSortedPrefixCounts,
  unresolvedCount,
  coverageByPrefix,
  type PrefixCount,
} from './classify-prefixes.mts'
import { isCoveredByPolicy, loadSandboxPolicy, type SandboxPolicy } from './policy.mts'
import type { ScanResult, SkipCounts } from './types.mts'

export type { PrefixCount } from './classify-prefixes.mts'
export type GenuineBypassCandidate = PrefixCount & { alreadyInAllowList: boolean }
export type BlockCandidate = PrefixCount & { alreadyDenied: boolean }

export type EscalationPressure = {
  claudeCovered: PrefixCount[]
  claudeUncovered: PrefixCount[]
  claudeUnresolvedCount: number
  e2bigCount: number
}

export type CategorizedAudit = {
  genuineBypassCandidates: GenuineBypassCandidate[]
  genuineBypassUnresolvedCount: number
  blockCandidates: BlockCandidate[]
  blockCandidateUnresolvedCount: number
  escalationPressure: EscalationPressure
  policyBlockCount: number
  // A count, not raw strings: worktree-denial error text embeds an absolute local
  // filesystem path (e.g. `.git/worktrees/<name>/FETCH_HEAD`), and this type is what
  // --json serializes directly — same rationale as readErrorCount below. Excluded from
  // genuineBypassCandidates by construction (classifyGenuineBypassCandidates only
  // collects kind === 'genuine'): an allowlist entry doesn't fix a write-path denial.
  worktreeDenialCount: number
  claudeFilesScanned: number
  codexFilesScanned: number
  // A count, not raw strings: each embeds an absolute transcript path, and this type
  // is what --json serializes directly. Making it a count (not string[]) makes the
  // leak structurally impossible — formatRaw renders the full list from ScanResult.
  readErrorCount: number
  // The repo roots discovery was scoped to, and how many candidate files were dropped
  // for falling outside them or for an unresolvable cwd — see repo-scope.mts and
  // report.mts's scopeLine.
  repoRoots: string[]
  skippedOtherRepo: SkipCounts
  skippedUnknownCwd: SkipCounts
  rawRetention: ScanResult['rawRetention']
}

export type ClassifyOptions = {
  settingsPath: string
}

// Section 1's Claude side comes from claudeSandboxFailures (real permission/access
// failures). Codex `with_escalated_permissions` uses are captured live by the
// dev/session-friction hook, not here.
function classifyGenuineBypassCandidates(
  scan: ScanResult,
  policy: SandboxPolicy,
): { candidates: GenuineBypassCandidate[]; unresolvedCount: number } {
  const commands: Array<string | undefined> = []
  for (const record of scan.claudeSandboxFailures) {
    if (record.kind === 'genuine') commands.push(record.command)
  }
  const counts = groupByPrefix(commands)
  const candidates = toSortedPrefixCounts(counts).map(entry => ({
    ...entry,
    alreadyInAllowList: isCoveredByPolicy(entry.prefix, policy.allowListTokens),
  }))
  return { candidates, unresolvedCount: unresolvedCount(counts) }
}

function classifyBlockCandidates(
  scan: ScanResult,
  policy: SandboxPolicy,
): { candidates: BlockCandidate[]; unresolvedCount: number } {
  const commands: Array<string | undefined> = []
  for (const record of scan.claudeDenials) {
    if (record.kind === 'user-rejected') commands.push(record.command)
  }
  const counts = groupByPrefix(commands)
  const deniedByPrefix = coverageByPrefix(commands, policy.denyListTokens)
  const candidates = toSortedPrefixCounts(counts).map(entry => ({
    ...entry,
    alreadyDenied: deniedByPrefix.get(entry.prefix) ?? false,
  }))
  return { candidates, unresolvedCount: unresolvedCount(counts) }
}

function classifyEscalationPressure(scan: ScanResult, policy: SandboxPolicy): EscalationPressure {
  const claudeCounts = groupByPrefix(scan.claudeEscalations.map(record => record.command))
  const claudeSplit = splitByCoverage(claudeCounts, policy.excludedCommandTokens)
  return {
    claudeCovered: claudeSplit.covered,
    claudeUncovered: claudeSplit.uncovered,
    claudeUnresolvedCount: claudeSplit.unresolvedCount,
    e2bigCount: scan.claudeSandboxFailures.filter(record => record.kind === 'e2big').length,
  }
}

// Ties scan.mts's raw records to .claude/settings.json (+ best-effort Codex rules) so
// report.mts only has to render already-categorized data — see
// .agents/skills/retrospective/sandbox-audit.md for what each bucket feeds.
export function classifyAudit(
  scan: ScanResult,
  options: ClassifyOptions,
): CategorizedAudit | { error: string } {
  const policy = loadSandboxPolicy(options.settingsPath)
  if ('error' in policy) return policy

  const genuine = classifyGenuineBypassCandidates(scan, policy)
  const block = classifyBlockCandidates(scan, policy)
  const policyBlockCount = scan.claudeDenials.filter(
    record => record.kind === 'permission-rule' || record.kind === 'automode-blocked',
  ).length

  return {
    genuineBypassCandidates: genuine.candidates,
    genuineBypassUnresolvedCount: genuine.unresolvedCount,
    blockCandidates: block.candidates,
    blockCandidateUnresolvedCount: block.unresolvedCount,
    escalationPressure: classifyEscalationPressure(scan, policy),
    policyBlockCount,
    worktreeDenialCount:
      scan.claudeSandboxFailures.filter(record => record.kind === 'worktree-denial').length +
      scan.codexSandboxFailures.length,
    claudeFilesScanned: scan.claudeFilesScanned,
    codexFilesScanned: scan.codexFilesScanned,
    readErrorCount: scan.readErrors.length,
    repoRoots: scan.repoRoots,
    skippedOtherRepo: scan.skippedOtherRepo,
    skippedUnknownCwd: scan.skippedUnknownCwd,
    rawRetention: scan.rawRetention,
  }
}
