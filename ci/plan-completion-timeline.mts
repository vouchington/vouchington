import { paginatedRows } from './plan-completion-data.mts'

type TimelineItem = {
  event?: unknown
  source?: { issue?: { number?: unknown; pull_request?: { url?: unknown } }; type?: unknown }
}

export function candidatePullRequestNumbers(json: string, repository: string): number[] {
  const pattern =
    /^https:\/\/api\.github\.com\/repos\/(?<repo>[\w.-]+\/[\w.-]+)\/pulls\/(?<number>[1-9]\d*)$/iu
  return [
    ...new Set(
      paginatedRows(json).flatMap(value => {
        const item = value as TimelineItem
        if (typeof item.event !== 'string') throw new Error('Timeline item is missing event')
        if (item.event !== 'cross-referenced') return []
        if (
          item.source?.type !== 'issue' ||
          typeof item.source.issue?.number !== 'number' ||
          !Number.isSafeInteger(item.source.issue.number)
        ) {
          throw new Error('Cross-referenced timeline item is missing an issue source')
        }
        const pullRequest = item.source.issue.pull_request
        if (pullRequest === undefined) return []
        const url = pullRequest.url
        if (typeof url !== 'string') {
          throw new Error('Timeline pull request candidate is missing url')
        }
        const match = pattern.exec(url)
        if (match?.groups === undefined)
          throw new Error('Timeline pull request candidate has invalid url')
        if (match.groups.repo.toLowerCase() !== repository.toLowerCase()) return []
        const number = Number(match.groups.number)
        return Number.isSafeInteger(number) ? [number] : []
      }),
    ),
  ]
}
