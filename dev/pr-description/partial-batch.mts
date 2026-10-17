import { formatReferenceKey, type ClosingIssueReference } from 'vouchington-tooling/gh-cli'

import type { IssueReferenceLookup } from './closing-refs.mts'
import { extractRelatedIssuesLines } from './scheduled-no-source.mts'

const VISIBLE_LINE = 'Partial batch; source issue remains open for remaining work.'
const MARKER = '<!-- related-issues-validation: partial-batch -->'
// The line pr_create renders for a `refs` relatedIssues entry: `- Refs #N — reason`, or
// `- Refs owner/repo#N — reason` for another repository. Anchoring the whole line keeps prose,
// inline code, and indented or commented copies from naming the source.
const RENDERED_REF_RE = /^- Refs (?:(?<owner>[\w.-]+)\/(?<repo>[\w.-]+))?#(?<number>\d+) — \S.*$/
const RENDERED_ISSUE_RE = /^- (?:Closes|Refs) /

function parseRenderedRefLine(line: string): ClosingIssueReference | undefined {
  const match = RENDERED_REF_RE.exec(line)
  const number = Number(match?.groups?.number)
  if (match === null || !Number.isSafeInteger(number)) return undefined
  const owner = match.groups?.owner?.toLowerCase()
  const repo = match.groups?.repo?.toLowerCase()
  return { key: formatReferenceKey({ number, owner, repo }), number, owner, repo }
}

/**
 * The source issue of a partial batch. pr_create renders `noSourceIssue: { reason: "partial batch" }`
 * after its `refs` entries, so the section must hold exactly one rendered issue line, a ref
 * immediately above the declaration pair; a second ref would leave the source ambiguous.
 */
export function extractPartialBatchSourceRef(body: string): ClosingIssueReference | undefined {
  const lines = extractRelatedIssuesLines(body).filter(line => line.trim() !== '')
  const indexes = lines.flatMap((line, index) =>
    line === VISIBLE_LINE && lines[index + 1] === MARKER ? [index] : [],
  )
  if (indexes.length !== 1 || lines.filter(line => RENDERED_ISSUE_RE.test(line)).length !== 1)
    return undefined
  return parseRenderedRefLine(lines[indexes[0] - 1] ?? '')
}

export function validatePartialBatchSourceRef(
  ref: ClosingIssueReference | undefined,
  lookup: IssueReferenceLookup | undefined,
  allowClosed = false,
): string[] {
  if (ref === undefined || lookup === undefined) return []
  const context = 'A partial batch requires an existing open source issue.'
  if (!lookup.ok) return [`${ref.key} could not be resolved: ${lookup.error}. ${context}`]
  if (lookup.issue.isPullRequest) return [`${ref.key} is a pull request, not an issue. ${context}`]
  if (!allowClosed && lookup.issue.state.toLowerCase() !== 'open')
    return [`${ref.key} is ${lookup.issue.state.toUpperCase()}. ${context}`]
  return []
}
