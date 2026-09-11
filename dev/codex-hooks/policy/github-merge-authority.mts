import type { BlockDecision } from './core.mts'

/**
 * `gh pr merge` is the direct path GitHub exposes for merging; `gh api` reaches merge-shaped
 * endpoints by a different path handled separately in github-api-merge-options.mts. See
 * docs/development/merge-authority.md for why the automation/interactive split is accepted:
 * automation never receives merge authority, while the interactive path proceeds only after an
 * explicit human merge decision.
 */
export function findGhPrMergeBlock(automationContext: boolean): BlockDecision {
  if (automationContext) {
    return {
      disposition: 'block',
      reason:
        'Merge authority is never delegated to an agent in automation. "gh pr merge" is banned in GitHub Actions, with or without --auto — arming auto-merge still merges without a contemporaneous human decision once checks pass. Interactive sessions may merge with human confirmation — see docs/development/merge-authority.md.',
    }
  }
  // Interactively, pre-tool-use-confirm-output.mts renders this 'confirm' disposition as a silent
  // allow: the human already made the merge decision by asking for it in their own message, so no
  // further tool-level prompt is forced. See docs/development/merge-authority.md.
  return {
    disposition: 'confirm',
    reason:
      'Merging is a human decision — confirm you want this exact merge before it proceeds. See docs/development/merge-authority.md.',
  }
}
