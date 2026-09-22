/**
 * Large additions are the trigger to split a PR rather than ship it whole — see
 * `.agents/skills/agent-workflow/git-and-prs.md`. Dependency, not size, decides whether that
 * split is a native GitHub stack or independent PRs against `main`; this only forces the split
 * decision to be made consciously instead of skipped by default. Deletion-heavy retirement work
 * can remain coherent at a larger limit. Deliberately no exclusion list for lockfiles or generated
 * files — filtering the count would make the thresholds unfalsifiable. The
 * `--acknowledge-large-diff` escape hatch covers a genuinely atomic large diff instead.
 */
export const LARGE_DIFF_ADDED_LINE_THRESHOLD = 5000
export const LARGE_DIFF_DELETED_LINE_THRESHOLD = 20_000

export type DiffLineChanges = {
  added: number
  deleted: number
}

/**
 * Added + removed lines in a unified diff (`git diff <base>...HEAD` output), excluding the
 * `+++`/`---` file-header lines so renamed/moved files don't double-count their path lines.
 *
 * Known limitation: this matches the literal `+++`/`---` prefix, not "is this actually a file
 * header." An added line whose content starts with `++`, or a removed line whose content starts
 * with `--` (a SQL comment, a CLI flag), renders as `+++`/`---` once the diff marker is prepended
 * and is silently excluded from the count — the same shape as a real header. For a ~5k-line
 * "probably needs a split" heuristic with a `--acknowledge-large-diff` override, that undercount is
 * acceptable; this is not a full hunk parser and is not meant to become one.
 */
export function countDiffLineChanges(diffText: string): DiffLineChanges {
  const changes: DiffLineChanges = { added: 0, deleted: 0 }
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) changes.added++
    else if (line.startsWith('-')) changes.deleted++
  }
  return changes
}

export function exceedsLargeDiffThreshold(changes: DiffLineChanges): boolean {
  return (
    changes.added > LARGE_DIFF_ADDED_LINE_THRESHOLD ||
    changes.deleted > LARGE_DIFF_DELETED_LINE_THRESHOLD
  )
}

export function formatLargeDiffRefusal(changes: DiffLineChanges): string {
  return (
    `PR create refused: this diff adds ${changes.added} and deletes ${changes.deleted} lines ` +
    `against origin/main. PRs may add at most ~${LARGE_DIFF_ADDED_LINE_THRESHOLD} lines and ` +
    `delete at most ~${LARGE_DIFF_DELETED_LINE_THRESHOLD} lines before the split decision is ` +
    'required (see .agents/skills/agent-workflow/git-and-prs.md).\n' +
    'Decide the split before opening this PR: if the parts cannot compile, test, or land ' +
    'independently, split it into a native GitHub stack (.agents/skills/stacked-prs/SKILL.md); ' +
    'if they can land in any order, open separate PRs targeting main instead.\n' +
    'If this PR is genuinely atomic (a lockfile bump, a generated-file refresh) and splitting ' +
    'would not help, rerun create with --acknowledge-large-diff to proceed anyway.\n'
  )
}
