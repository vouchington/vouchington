import { normalizeCommandPrefix } from '../retrospective-transcript-facts/command-prefix.mts'
import { isCoveredByPolicy } from './policy.mts'

export type PrefixCount = { prefix: string; count: number }

// A command that couldn't be normalized (correlation failed, or the record shape had
// no resolvable command text) is still counted so it isn't a silent drop — it just
// can't anchor an actionable per-prefix candidate row.
const UNRESOLVED_PREFIX = ''

export function groupByPrefix(commands: Array<string | undefined>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const command of commands) {
    const prefix = command ? normalizeCommandPrefix(command) : UNRESOLVED_PREFIX
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }
  return counts
}

export function toSortedPrefixCounts(counts: Map<string, number>): PrefixCount[] {
  const entries: PrefixCount[] = []
  for (const [prefix, count] of counts) {
    if (prefix !== UNRESOLVED_PREFIX) entries.push({ prefix, count })
  }
  return entries.sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix))
}

export function unresolvedCount(counts: Map<string, number>): number {
  return counts.get(UNRESOLVED_PREFIX) ?? 0
}

// Checked against each raw command, not the normalized prefix: deny tokens can run
// deeper (e.g. ["rm","-rf","/"]) than normalizeCommandPrefix's generic two-token depth
// (tuned for the allow list, not deny). A prefix group counts as already-denied only
// when every raw command in it is individually covered — one uncovered instance means
// the group still needs human review (safe failure mode).
export function coverageByPrefix(
  commands: Array<string | undefined>,
  policyTokenSets: string[][],
): Map<string, boolean> {
  const coverage = new Map<string, boolean>()
  for (const command of commands) {
    if (!command) continue
    const prefix = normalizeCommandPrefix(command)
    const covered = isCoveredByPolicy(command, policyTokenSets)
    coverage.set(prefix, (coverage.get(prefix) ?? true) && covered)
  }
  return coverage
}

// Checked against the normalized prefix, not the raw command (unlike coverageByPrefix
// above) — excludedCommandTokens are deliberately matched at prefix depth, since this
// function partitions escalation-pressure candidates by prefix group, not by individual
// deny-listed command.
export function splitByCoverage(
  counts: Map<string, number>,
  policyTokenSets: string[][],
): { covered: PrefixCount[]; uncovered: PrefixCount[]; unresolvedCount: number } {
  const covered = new Map<string, number>()
  const uncovered = new Map<string, number>()
  for (const [prefix, count] of counts) {
    if (prefix === UNRESOLVED_PREFIX) continue
    const target = isCoveredByPolicy(prefix, policyTokenSets) ? covered : uncovered
    target.set(prefix, count)
  }
  return {
    covered: toSortedPrefixCounts(covered),
    uncovered: toSortedPrefixCounts(uncovered),
    unresolvedCount: unresolvedCount(counts),
  }
}
