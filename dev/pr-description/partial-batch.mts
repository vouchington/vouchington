import type { ClosingIssueReference, IssueReferenceLookup } from './closing-refs.mts'
import { extractRelatedIssuesLines, parseStandaloneIssueRefLine } from './scheduled-no-source.mts'

const VISIBLE_LINE = 'Partial batch; source issue remains open for remaining work.'
const MARKER = '<!-- related-issues-validation: partial-batch -->'

/** Binds the explicit partial-batch declaration to its nearest standalone source reference. */
export function extractPartialBatchSourceRef(body: string): ClosingIssueReference | undefined {
  const lines = extractRelatedIssuesLines(body)
  const indexes = lines.flatMap((line, index) =>
    line === VISIBLE_LINE && lines[index + 1] === MARKER ? [index] : [],
  )
  if (indexes.length !== 1) return undefined
  let refIndex = indexes[0] - 1
  while (refIndex >= 0 && lines[refIndex]?.trim() === '') refIndex -= 1
  return parseStandaloneIssueRefLine(lines[refIndex] ?? '')
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
