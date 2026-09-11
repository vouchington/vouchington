import { createRequire } from 'node:module'

type GitHubTaskParser = typeof import('./github-tasks.mts').hasUncheckedGitHubTask

const requireFromHere = createRequire(import.meta.url)
let githubTaskParser: GitHubTaskParser | undefined

export function hasUncheckedGitHubTask(body: string): boolean {
  githubTaskParser ??= (
    requireFromHere('./github-tasks.mts') as typeof import('./github-tasks.mts')
  ).hasUncheckedGitHubTask
  return githubTaskParser(body)
}
