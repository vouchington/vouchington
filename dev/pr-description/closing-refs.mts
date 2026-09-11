import { hasUncheckedGitHubTask } from './github-tasks-loader.mts'

export type ClosingIssueReference = {
  key: string
  number: number
  owner: string | undefined
  repo: string | undefined
}

export type ReferencedIssue = {
  body: string
  isPullRequest: boolean
  milestone?: string
  number: number
  state: string
  title: string
  url: string
}

export type IssueReferenceLookup =
  | { issue: ReferencedIssue; ok: true }
  | { error: string; ok: false }

type IssueReferenceValidationResult = {
  errors: string[]
  issues: ReferencedIssue[]
}

type GitHubIssueApiResponse = {
  body?: string | null
  html_url?: string
  milestone?: { title?: string } | null
  number?: number
  pull_request?: unknown
  state?: string
  title?: string
}

const CLOSING_ISSUE_RE =
  /\b(?:close(?:s|d)?|fix(?:es|ed)?|resolve(?:s|d)?):?[ \t]+(?:(?<repo>[\w.-]+\/[\w.-]+)?#(?<number>\d+)|https?:\/\/github\.com\/(?<urlRepo>[\w.-]+\/[\w.-]+)\/issues\/(?<urlNumber>\d+))\b/gi

export const ESCAPE_COMMENT_RE =
  /<!--\s*related-issues-validation:\s*allow\s+(?<ref>(?:[\w.-]+\/[\w.-]+)?#\d+)\s+because\s+(?<reason>.*?)-->/gis

export function parseClosingIssueReferences(body: string): ClosingIssueReference[] {
  const refs: ClosingIssueReference[] = []
  const seen = new Set<string>()

  for (const match of body.matchAll(CLOSING_ISSUE_RE)) {
    const number = Number(match.groups?.number ?? match.groups?.urlNumber)
    if (!Number.isSafeInteger(number)) continue

    const repoRef = (match.groups?.repo ?? match.groups?.urlRepo)?.toLowerCase()
    const [owner, repo] = repoRef?.split('/') ?? [undefined, undefined]
    const key = formatReferenceKey({ number, owner, repo })
    if (seen.has(key)) continue
    seen.add(key)

    refs.push({
      key,
      number,
      owner,
      repo,
    })
  }

  return refs
}

export function hasClosingIssueReference(body: string): boolean {
  return parseClosingIssueReferences(body).length > 0
}

export function formatReferenceKey(ref: {
  number: number
  owner?: string | undefined
  repo?: string | undefined
}): string {
  return ref.owner !== undefined && ref.repo !== undefined
    ? `${ref.owner}/${ref.repo}#${ref.number}`
    : `#${ref.number}`
}

function hasIssueReferenceEscape(body: string, ref: ClosingIssueReference): boolean {
  for (const match of body.matchAll(ESCAPE_COMMENT_RE)) {
    const escapedRef = normalizeEscapeReference(match.groups?.ref ?? '')
    const reason = match.groups?.reason?.trim() ?? ''
    if (escapedRef === ref.key && reason.length > 0) {
      return true
    }
  }

  return false
}

export function validateResolvedIssueReferences(
  body: string,
  refs: ClosingIssueReference[],
  lookups: Map<string, IssueReferenceLookup>,
  allowedClosedReferences: ReadonlySet<string> = new Set(),
  requireClosedReferences = false,
): IssueReferenceValidationResult {
  const errors: string[] = []
  const issues: ReferencedIssue[] = []

  for (const ref of refs) {
    const lookup = lookups.get(ref.key)
    if (lookup?.ok === true) {
      const issue = lookup.issue
      const { body: issueBody, isPullRequest, state, title } = issue
      issues.push(issue)
      if (isPullRequest) {
        pushUnlessEscaped(
          errors,
          body,
          ref,
          `${ref.key} resolves to a pull request, not an issue (${title}).`,
        )
      } else if (state.toLowerCase() === 'open' && requireClosedReferences) {
        pushUnlessEscaped(errors, body, ref, `${ref.key} remains OPEN after merge: ${title}.`)
      } else if (state.toLowerCase() !== 'open' && !allowedClosedReferences.has(ref.key)) {
        pushUnlessEscaped(errors, body, ref, `${ref.key} is ${state.toUpperCase()}: ${title}.`)
      }
      if (hasUncheckedGitHubTask(issueBody)) {
        pushUnlessEscaped(
          errors,
          body,
          ref,
          `${ref.key} contains at least one unchecked task: ${title}.`,
        )
      }
      continue
    }

    pushUnlessEscaped(
      errors,
      body,
      ref,
      `${ref.key} could not be resolved as an open GitHub issue${
        lookup?.ok === false ? `: ${lookup.error}` : '.'
      }`,
    )
  }

  return { errors, issues }
}

export function parseGitHubIssueApiResponse(json: string): ReferencedIssue {
  const parsed = JSON.parse(json) as GitHubIssueApiResponse
  const { html_url, number, state, title } = parsed
  if (
    typeof html_url !== 'string' ||
    typeof number !== 'number' ||
    typeof state !== 'string' ||
    typeof title !== 'string'
  ) {
    const missingFields = [
      typeof html_url !== 'string' && 'html_url',
      typeof number !== 'number' && 'number',
      typeof state !== 'string' && 'state',
      typeof title !== 'string' && 'title',
    ].filter((field): field is string => field !== false)
    throw new Error(`GitHub issue response missing required fields: ${missingFields.join(', ')}`)
  }

  return {
    body: typeof parsed.body === 'string' ? parsed.body : '',
    isPullRequest: parsed.pull_request !== undefined,
    milestone: typeof parsed.milestone?.title === 'string' ? parsed.milestone.title : undefined,
    number,
    state,
    title,
    url: html_url,
  }
}

function pushUnlessEscaped(
  errors: string[],
  body: string,
  ref: ClosingIssueReference,
  message: string,
): void {
  if (hasIssueReferenceEscape(body, ref)) {
    return
  }

  errors.push(
    `${message} Add "<!-- related-issues-validation: allow ${ref.key} because <reason> -->" only for an intentional exception.`,
  )
}

function normalizeEscapeReference(ref: string): string {
  const match = /^(?:(?<owner>[\w.-]+)\/(?<repo>[\w.-]+))?#(?<number>\d+)$/.exec(ref.trim())
  if (match === null) return ref
  return formatReferenceKey({
    number: Number(match.groups?.number),
    owner: match.groups?.owner?.toLowerCase(),
    repo: match.groups?.repo?.toLowerCase(),
  })
}
