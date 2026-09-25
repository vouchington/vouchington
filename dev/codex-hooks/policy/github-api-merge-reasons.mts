import type { BlockDecision } from './core.mts'

// Automation block for a direct `gh api` PUT-merge — see findGhApiMergeBlock in
// github-api-merge-options.mts. Both blocks keep the "never delegated to an agent" phrase, since
// dev/codex-hooks-tests/__tests__/codex-hook-gh-api-merge-policy.test.mts asserts on it.
export const API_MERGE_BLOCK: BlockDecision = {
  disposition: 'block',
  reason:
    'Merge authority is never delegated to an agent in automation. "gh api" must not be used to merge a pull request or a branch directly (PUT .../pulls/.../merge, POST .../merges); an immediate merge is banned in GitHub Actions by repository policy. This check is best-effort defense-in-depth — the branch-protection ruleset on the target branch is the real boundary. Interactive sessions may merge with human confirmation — see docs/development/merge-authority.md.',
}

// Automation block for a merge-arming GraphQL mutation via `gh api graphql`.
export const GRAPHQL_MERGE_BLOCK: BlockDecision = {
  disposition: 'block',
  reason:
    'Merge authority is never delegated to an agent in automation. Arming or performing a merge via the GraphQL enablePullRequestAutoMerge/mergePullRequest mutations through "gh api graphql" is banned in GitHub Actions by repository policy. This check is best-effort defense-in-depth — the branch-protection ruleset on the target branch is the real boundary. Interactive sessions may merge with human confirmation — see docs/development/merge-authority.md.',
}
