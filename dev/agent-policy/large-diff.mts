import { processDiffCommand, runGh, runGit } from 'vouchington-tooling/gh-cli'
import {
  exceedsLargeDiffThreshold,
  type DiffLineChanges,
  type LargeDiffThresholds,
} from 'vouchington-tooling/pull-request-diff'

import {
  createDiffSummary,
  reduceDiffBlock,
  type DiffSummary,
} from '../pr-description/diff-summary.mts'
import { createLocalPackageJsonReader } from '../pr-description/package-json-source.mts'
import { currentRepo } from '../pr-description/related-issues.mts'
import { sanitizedLines } from '../pr-description/sanitized-lines.mts'
import { runAdvisorySupersessionSearch } from '../pr-description/supersession.mts'

/**
 * Large additions are the trigger to split a PR rather than ship it whole — see
 * `.agents/skills/agent-workflow/git-and-prs.md`. Dependency, not size, decides whether that
 * split is a native GitHub stack or independent PRs against `main`; this only forces the split
 * decision to be made consciously instead of skipped by default. Deletion-heavy retirement work
 * can remain coherent at a larger limit. Counts include generated files so the full diff stays
 * visible. The workflow's standing CI-generated schema snapshot exception uses the
 * `### Large diff` acknowledgement section without another approval when the remaining diff fits
 * the budgets. Other genuinely atomic large diffs also use that explicit acknowledgement.
 */
const LARGE_DIFF_THRESHOLDS: LargeDiffThresholds = { addedLines: 5000, deletedLines: 20_000 }

function formatLargeDiffRefusal(
  changes: DiffLineChanges,
  base: string,
  thresholds: LargeDiffThresholds,
): string {
  return (
    `PR create refused: this diff adds ${changes.added} and deletes ${changes.deleted} lines ` +
    `against origin/${base}. PRs may add at most ~${thresholds.addedLines} lines and ` +
    `delete at most ~${thresholds.deletedLines} lines before the split decision is ` +
    'required (see .agents/skills/agent-workflow/git-and-prs.md).\n' +
    'Decide the split before opening this PR: if the parts cannot compile, test, or land ' +
    'independently, split it into a native GitHub stack (.agents/skills/stacked-prs/SKILL.md); ' +
    'if they can land in any order, open separate PRs targeting main instead.\n' +
    'If this PR is genuinely atomic (a lockfile bump, a generated-file refresh) and splitting ' +
    'would not help, add a `details` entry that starts with the line `### Large diff` and ' +
    'explains why it stays whole, then rerun pr_create.\n' +
    'Apply the standing generated-schema-snapshot exception in the workflow without asking ' +
    'for another size approval; the handwritten diff must still fit the budgets.\n'
  )
}

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

const ACKNOWLEDGEMENT_HEADING = /^ {0,3}###[ \t]+Large diff[ \t]*$/i
// CommonMark allows up to three spaces before an ATX heading.
const SECTION_END = /^ {0,3}(?:#{1,6}[ \t]|Workspace setup:)/

const COMMENT_LINE = /^<!--.*-->$/

/**
 * True when a visible `### Large diff` details section carries at least one visible line of
 * explanation: fenced code, HTML blocks, and comments neither open the section nor explain it.
 */
export function hasLargeDiffAcknowledgement(body: string): boolean {
  const lines = sanitizedLines(body).map(line => (COMMENT_LINE.test(line.trim()) ? '' : line))
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
  const thresholds = options.thresholds ?? LARGE_DIFF_THRESHOLDS
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
