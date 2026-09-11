import type { ReferencedIssue } from './closing-refs.mts'

export function formatReferencedIssueSummary(issues: ReferencedIssue[]): string {
  if (issues.length === 0) return ''
  const lines = [
    'Referenced closing issues:',
    ...issues.map(issue => {
      const state = issue.state.toUpperCase()
      const kind = issue.isPullRequest ? 'pull request' : 'issue'
      return `  #${issue.number} ${state} ${kind}: ${issue.title}`
    }),
    '',
  ]
  return lines.join('\n')
}
