import { processDiffCommand } from 'vouchington-tooling/gh-cli'

import {
  countDiffLineChanges,
  DEFAULT_LARGE_DIFF_THRESHOLDS,
  exceedsLargeDiffThreshold,
  formatLargeDiffRefusal,
  type DiffLineChanges,
  type LargeDiffThresholds,
} from '../pr-description/diff-size.mts'

export type LargeDiffOptions = { thresholds?: LargeDiffThresholds }

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

async function branchLineChanges(base: string): Promise<DiffLineChanges> {
  const changes: DiffLineChanges = { added: 0, deleted: 0 }
  await processDiffCommand(
    { executable: 'git', args: ['diff', `origin/${base}...HEAD`] },
    block => {
      const counted = countDiffLineChanges(block)
      changes.added += counted.added
      changes.deleted += counted.deleted
    },
  )
  return changes
}

/**
 * The split-decision gate for `pr_create`: the branch diff against `origin/<base>` (the policy
 * child runs in the worktree) must fit the thresholds unless the body carries a `### Large diff`
 * details section. An unreadable diff warns rather than blocks.
 */
export async function checkLargeDiff(
  base: string,
  body: string,
  options: LargeDiffOptions = {},
): Promise<{ errors: string[]; warnings: string[] }> {
  let changes: DiffLineChanges
  try {
    changes = await branchLineChanges(base)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return {
      errors: [],
      warnings: [
        `Could not measure the diff against origin/${base}; large-diff gate skipped: ${reason}`,
      ],
    }
  }
  const thresholds = options.thresholds ?? DEFAULT_LARGE_DIFF_THRESHOLDS
  if (!exceedsLargeDiffThreshold(changes, thresholds) || hasLargeDiffAcknowledgement(body))
    return { errors: [], warnings: [] }
  return { errors: [formatLargeDiffRefusal(changes, base, thresholds).trimEnd()], warnings: [] }
}
