import type { assessPlanCompletion } from '../dev/pr-description/plan-completion.mts'

const MARKER = '<!-- plan-completion-advisory -->'
const WORKFLOW_BOT = 'github-actions[bot]'

type Issue = { number?: unknown; pull_request?: unknown; state?: unknown; title?: unknown }
type PullRequest = { body?: unknown; merged_at?: unknown; number?: unknown; state?: unknown }
type Comment = { body?: unknown; id?: unknown; user?: { login?: unknown } }
type TimelineItem = {
  event?: unknown
  source?: { issue?: { number?: unknown; pull_request?: { url?: unknown } }; type?: unknown }
}

type MarkerComment = { body: string; id: number }

function pages(json: string): unknown[] {
  const parsed = JSON.parse(json) as unknown
  if (!Array.isArray(parsed) || !parsed.every(Array.isArray)) {
    throw new Error('Expected gh --paginate --slurp to return an array of pages')
  }
  return parsed.flat()
}

export function openPlans(json: string): number[] {
  return pages(json).flatMap(value => {
    const issue = value as Issue
    if (
      typeof issue.number !== 'number' ||
      !Number.isSafeInteger(issue.number) ||
      issue.state !== 'open' ||
      typeof issue.title !== 'string'
    ) {
      throw new Error('Open issues response is missing number, state, or title')
    }
    return issue.pull_request === undefined &&
      issue.state === 'open' &&
      issue.title.startsWith('Plan:')
      ? [issue.number]
      : []
  })
}

export function isCurrentOpenPlan(json: string, number: number): boolean {
  const issue = JSON.parse(json) as Issue
  if (
    issue.number !== number ||
    typeof issue.state !== 'string' ||
    !['open', 'closed'].includes(issue.state) ||
    typeof issue.title !== 'string'
  ) {
    throw new Error('Current Plan response is missing a matching number, state, or title')
  }
  return (
    issue.pull_request === undefined &&
    issue.number === number &&
    issue.state === 'open' &&
    typeof issue.title === 'string' &&
    issue.title.startsWith('Plan:')
  )
}

export function pullRequest(json: string, expectedNumber: number) {
  const parsed = JSON.parse(json) as PullRequest
  if (
    parsed.number !== expectedNumber ||
    typeof parsed.state !== 'string' ||
    !['open', 'closed'].includes(parsed.state) ||
    !Object.hasOwn(parsed, 'body') ||
    !Object.hasOwn(parsed, 'merged_at')
  ) {
    throw new Error(
      'Current pull request response is missing matching number, state, body, or merged_at',
    )
  }
  if (parsed.body !== null && parsed.body !== undefined && typeof parsed.body !== 'string') {
    throw new Error('Current pull request response has an invalid body')
  }
  if (parsed.merged_at !== null && typeof parsed.merged_at !== 'string') {
    throw new Error('Current pull request response has an invalid merged_at')
  }
  return {
    body: parsed.body ?? '',
    merged: typeof parsed.merged_at === 'string',
    number: parsed.number,
    state: parsed.state,
  }
}

export function candidatePullRequestNumbers(json: string, repository: string): number[] {
  const pattern =
    /^https:\/\/api\.github\.com\/repos\/(?<repo>[\w.-]+\/[\w.-]+)\/pulls\/(?<number>[1-9]\d*)$/iu
  return [
    ...new Set(
      pages(json).flatMap(value => {
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
        if (pullRequest !== undefined && typeof pullRequest.url !== 'string') {
          throw new Error('Timeline pull request candidate is missing url')
        }
        const url = pullRequest?.url
        if (url === undefined) return []
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

export function markerComment(json: string): MarkerComment | undefined {
  let marker: MarkerComment | undefined
  for (const value of pages(json)) {
    const comment = value as Comment
    if (
      typeof comment.id !== 'number' ||
      typeof comment.body !== 'string' ||
      typeof comment.user?.login !== 'string'
    ) {
      throw new Error('Issue comments response is missing id, body, or author login')
    }
    if (comment.body.includes(MARKER) && comment.user?.login === WORKFLOW_BOT) {
      if (marker !== undefined) throw new Error('Multiple workflow-owned advisory comments found')
      marker = { body: comment.body, id: comment.id }
    }
  }
  return marker
}

export function assertCommentReadback(json: string, id: number, body: string): void {
  const comment = JSON.parse(json) as Comment
  if (comment.id !== id || comment.body !== body || comment.user?.login !== WORKFLOW_BOT) {
    throw new Error('Comment readback does not match the workflow-owned advisory')
  }
}

export function commentBody(
  number: number,
  advisory: ReturnType<typeof assessPlanCompletion>,
): string {
  const detail =
    advisory.kind === 'stranded-sibling'
      ? `Plan #${number} has exactly one open non-closing sibling: #${advisory.sibling}.`
      : advisory.kind === 'unopened-work'
        ? `Plan #${number} has no open related pull requests while it remains open.`
        : `Plan #${number} has no current completion advisory.`
  return `${MARKER}\n## Plan completion advisory\n\n${detail} This is a current snapshot only; audit planned-but-unopened work before closing the Plan.`
}

export function listArgs(path: string): string[] {
  return ['api', '-X', 'GET', '--paginate', '--slurp', path, '-f', 'per_page=100']
}

export function readArgs(path: string): string[] {
  return ['api', '-X', 'GET', path]
}
