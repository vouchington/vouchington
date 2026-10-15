import { processDiffCommand, runGh, runGit } from 'vouchington-tooling/gh-cli'

import {
  DEFAULT_LARGE_DIFF_THRESHOLDS,
  exceedsLargeDiffThreshold,
  formatLargeDiffRefusal,
  type LargeDiffThresholds,
} from '../pr-description/diff-size.mts'
import {
  createDiffSummary,
  reduceDiffBlock,
  type DiffSummary,
} from '../pr-description/diff-summary.mts'
import { createLocalPackageJsonReader } from '../pr-description/package-json-source.mts'
import { currentRepo } from '../pr-description/related-issues.mts'
import { runAdvisorySupersessionSearch } from '../pr-description/supersession.mts'

export type LargeDiffOptions = {
  thresholds?: LargeDiffThresholds
  /** Returns advisory supersession hints for the branch diff; injectable for tests. */
  supersessionHints?: (summary: DiffSummary) => Promise<string>
}

async function localSupersessionHints(summary: DiffSummary): Promise<string> {
  return runAdvisorySupersessionSearch(
    runGh,
    await currentRepo(runGh),
    summary,
    createLocalPackageJsonReader(runGit),
  )
}

const ACKNOWLEDGEMENT_HEADING = /^###[ \t]+Large diff[ \t]*$/i
const SECTION_END = /^(?:#{1,6}[ \t]|Workspace setup:)/

/** True when a `### Large diff` details section carries at least one line of explanation. */
export function hasLargeDiffAcknowledgement(body: string): boolean {
  const lines = body.split('\n')
  const start = lines.findIndex(line => ACKNOWLEDGEMENT_HEADING.test(line.trimEnd()))
  if (start === -1) return false
  for (const line of lines.slice(start + 1)) {
    if (SECTION_END.test(line)) return false
    if (line.trim() !== '') return true
  }
  return false
}

async function branchDiffSummary(base: string): Promise<DiffSummary> {
  const summary = createDiffSummary()
  await processDiffCommand({ executable: 'git', args: ['diff', `origin/${base}...HEAD`] }, block =>
    reduceDiffBlock(summary, block),
  )
  return summary
}

/**
 * Create-time checks on the branch diff against `origin/<base>` (the policy child runs in the
 * worktree). The split-decision gate fails unless the body carries a `### Large diff` details
 * section; supersession hints are advisory warnings. An unreadable diff or failed search warns
 * rather than blocks.
 */
export async function checkLargeDiff(
  base: string,
  body: string,
  options: LargeDiffOptions = {},
): Promise<{ errors: string[]; warnings: string[] }> {
  let summary: DiffSummary
  try {
    summary = await branchDiffSummary(base)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return {
      errors: [],
      warnings: [
        `Could not measure the diff against origin/${base}; diff checks skipped: ${reason}`,
      ],
    }
  }
  const thresholds = options.thresholds ?? DEFAULT_LARGE_DIFF_THRESHOLDS
  const errors: string[] = []
  if (
    exceedsLargeDiffThreshold(summary.lineChanges, thresholds) &&
    !hasLargeDiffAcknowledgement(body)
  )
    errors.push(formatLargeDiffRefusal(summary.lineChanges, base, thresholds).trimEnd())
  const warnings: string[] = []
  try {
    const hints = (await (options.supersessionHints ?? localSupersessionHints)(summary)).trim()
    if (hints !== '') warnings.push(hints)
  } catch (err) {
    warnings.push(`Supersession search failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return { errors, warnings }
}
