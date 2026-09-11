import {
  type ClosingIssueReference,
  type IssueReferenceLookup,
  formatReferenceKey,
} from './closing-refs.mts'
import { sanitizedLines } from './sanitized-lines.mts'

// This module holds two independent "no closing keyword required" exceptions to the
// git-and-prs.md closing-reference rule. Each pairs an exact visible line with an exact HTML
// comment marker so the check can't be satisfied by accident, plus one extra structural
// requirement unique to its own scenario (see each function below).
const RELATED_ISSUES_HEADING_RE = /^##\s+Related\s+issues\s*$/i

const SCHEDULED_NO_SOURCE_VISIBLE_LINE = 'No source issue; scheduled prompt run.'
const SCHEDULED_NO_SOURCE_MARKER = '<!-- related-issues-validation: no-source-scheduled-prompt -->'
const SCHEDULED_WORKSPACE_SETUP_LINE = 'Workspace setup: Auto Harness scheduled prompt'

const FIX_MAIN_INTERIM_CLASSIFIER_VISIBLE_LINE =
  'No closing reference; root-cause issue tracked via the Refs entry above.'
const FIX_MAIN_INTERIM_CLASSIFIER_MARKER =
  '<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->'
// Unlike every other non-closing Refs/Part-of reference in this codebase (see git-and-prs.md),
// this specific Refs entry stands in for the closing keyword this exception waives, so it is
// resolved and required to name an open, non-pull-request issue (see validate.mts and
// github-closing-refs.mts). Anchoring the whole trimmed line — rather than searching for the
// pattern anywhere in the text — means prose ("Do not use Refs #456"), inline code
// (`` `Refs #456` ``), and HTML comments (`<!-- Refs #456 -->`) can never satisfy it: each wraps
// the match in characters that break the ^...$ anchors.
const STANDALONE_ROOT_CAUSE_REF_RE =
  /^Refs:?[ \t]+(?:(?<owner>[\w.-]+)\/(?<repo>[\w.-]+))?#(?<number>\d+)$/i
const FIX_MAIN_WORKSPACE_SETUP_LINE = 'Workspace setup: Automation fix-main run'

function extractRelatedIssuesLines(bodyLines: string[]): string[] {
  const sections = bodyLines.join('\n').split(/^(?=##\s)/m)
  const section = sections.find(candidate => {
    const [heading = ''] = candidate.split(/\r?\n/, 1)
    return RELATED_ISSUES_HEADING_RE.test(heading)
  })
  return section?.split(/\r?\n/) ?? []
}

export function isScheduledPromptNoSourceBody(body: string): boolean {
  const bodyLines = sanitizedLines(body)
  const relatedIssuesLines = extractRelatedIssuesLines(bodyLines)

  return (
    relatedIssuesLines.some(
      (line, index) =>
        line === SCHEDULED_NO_SOURCE_VISIBLE_LINE &&
        relatedIssuesLines[index + 1] === SCHEDULED_NO_SOURCE_MARKER,
    ) && bodyLines.includes(SCHEDULED_WORKSPACE_SETUP_LINE)
  )
}

/**
 * Fix Main's unclassified-transient interim classifier (see
 * docs/prompts/automation/fix-main.md) can only link its root-cause issue as a non-closing
 * `Refs #N` — it has no source issue of its own to close and no authority to file one. Accept
 * that PR body only when it carries this exact marker pair, the standalone `Refs #N` line
 * immediately above it (its own visible text reads "the Refs entry above") is actually present,
 * and the Fix Main-specific workspace-setup line is present — the marker pair alone names no Fix
 * Main-specific provenance, so without that line any agent-authored PR could copy it to waive the
 * closing-reference requirement.
 */
// Shared by both functions below so "this body uses the exception" and "here is its ref" can
// never disagree: a standalone `Refs #N` line whose number is not safely parseable (see
// STANDALONE_ROOT_CAUSE_REF_RE) counts as no ref at all, not as an exception with a missing ref —
// otherwise the exception's structural check would waive the closing-keyword requirement while
// its own root-cause validation silently skipped, letting an unparseable number through unchecked.
// CommonMark measures leading indentation in columns, not characters: a tab advances to the next
// multiple of four rather than adding one, so a one-space-then-tab prefix reaches column four
// (space: 0→1, tab: 1→4) without either 4 literal spaces or a leading tab — the two shapes a naive
// `/^(?: {4,}|\t)/` regex catches. Column four is CommonMark's indented-code-block threshold, which
// disables inline reprocessing the same as either literal shape, so `line.trim()` alone would let a
// visually-fenced-off `Refs #N` satisfy the exception even though it isn't the plain standalone
// entry the visible text names — any prefix reaching column four must be rejected, however it's
// spelled.
function leadingIndentColumns(line: string): number {
  let column = 0
  for (const character of line) {
    if (character === ' ') {
      column += 1
    } else if (character === '\t') {
      column += 4 - (column % 4)
    } else {
      break
    }
  }
  return column
}

function parseStandaloneRootCauseRefLine(line: string): ClosingIssueReference | undefined {
  if (leadingIndentColumns(line) >= 4) return undefined

  const match = STANDALONE_ROOT_CAUSE_REF_RE.exec(line.trim())
  if (match === null) return undefined

  const number = Number(match.groups?.number)
  if (!Number.isSafeInteger(number)) return undefined

  const owner = match.groups?.owner?.toLowerCase()
  const repo = match.groups?.repo?.toLowerCase()
  return { key: formatReferenceKey({ number, owner, repo }), number, owner, repo }
}

// Shared by both functions below: the root-cause ref is tied to the nearest standalone line above
// the marker pair — skipping blank paragraph breaks, since fix-main.md only requires the ref to be
// "present in the same section," not immediately adjacent with no blank line — never to any
// Refs-shaped line further back in the section: otherwise an earlier decoy `Refs #N` line would
// validate while the entry a reader (and the visible text itself) treats as authoritative went
// unchecked. Any non-blank, non-matching line in between (prose, an indented block, a comment)
// still stops the walk immediately, so it isn't skipped like a blank line would be.
function findAdjacentRootCauseRef(relatedIssuesLines: string[]): ClosingIssueReference | undefined {
  const markerIndex = relatedIssuesLines.findIndex(
    (line, index) =>
      line === FIX_MAIN_INTERIM_CLASSIFIER_VISIBLE_LINE &&
      relatedIssuesLines[index + 1] === FIX_MAIN_INTERIM_CLASSIFIER_MARKER,
  )
  if (markerIndex <= 0) return undefined

  let refIndex = markerIndex - 1
  while (refIndex >= 0 && relatedIssuesLines[refIndex]?.trim() === '') {
    refIndex -= 1
  }
  if (refIndex < 0) return undefined

  return parseStandaloneRootCauseRefLine(relatedIssuesLines[refIndex] ?? '')
}

export function isFixMainInterimClassifierNoClosingRefBody(body: string): boolean {
  const bodyLines = sanitizedLines(body)
  const relatedIssuesLines = extractRelatedIssuesLines(bodyLines)

  return (
    findAdjacentRootCauseRef(relatedIssuesLines) !== undefined &&
    bodyLines.includes(FIX_MAIN_WORKSPACE_SETUP_LINE)
  )
}

/**
 * Extracts the Fix Main interim-classifier's root-cause `Refs #N` reference so callers can
 * resolve it and require an open, non-pull-request issue — the one non-closing reference in the
 * codebase whose presence alone is not enough (see the constant comment above). Returns
 * `undefined` when the body doesn't carry the exception at all, or the exception's standalone
 * Refs line for `isFixMainInterimClassifierNoClosingRefBody` to still reject on shape grounds.
 */
export function extractFixMainInterimClassifierRootCauseRef(
  body: string,
): ClosingIssueReference | undefined {
  if (!isFixMainInterimClassifierNoClosingRefBody(body)) return undefined

  return findAdjacentRootCauseRef(extractRelatedIssuesLines(sanitizedLines(body)))
}

const FIX_MAIN_ROOT_CAUSE_CONTEXT_LABEL =
  'The Fix Main interim-classifier exception requires an existing open root-cause issue.'

/**
 * Validates an already-resolved lookup of the Fix Main interim-classifier's root-cause ref —
 * the one non-closing reference in the codebase required to name an open, non-pull-request
 * issue (see the constant comment above `extractFixMainInterimClassifierRootCauseRef`). Callers
 * resolve `rootCauseRef` themselves (sync or async) and pass the result here; `lookup` is
 * `undefined` when `rootCauseRef` is `undefined`, i.e. the body doesn't carry the exception. The
 * root-cause issue is deliberately not returned here: it is a non-closing reference and must not
 * be reported as a "Referenced closing issue" (see `formatReferencedIssueSummary`).
 *
 * `allowClosed` waives the open-issue requirement for a PR that has already merged: fix-main.md
 * requires the root-cause issue open only immediately before publication, and once the
 * interim-classifier PR has merged, that root-cause issue is expected to eventually get fixed and
 * closed. Pre-publication callers (e.g. the closing-refs policy hook) must leave this `false` so
 * the gate still holds at the moment that matters.
 */
export function validateFixMainRootCauseRef(
  rootCauseRef: ClosingIssueReference | undefined,
  lookup: IssueReferenceLookup | undefined,
  allowClosed = false,
): string[] {
  if (rootCauseRef === undefined || lookup === undefined) {
    return []
  }
  if (lookup.ok !== true) {
    return [
      `${rootCauseRef.key} could not be resolved as an open GitHub issue: ${lookup.error}. ${FIX_MAIN_ROOT_CAUSE_CONTEXT_LABEL}`,
    ]
  }
  if (lookup.issue.isPullRequest) {
    return [
      `${rootCauseRef.key} resolves to a pull request, not an issue (${lookup.issue.title}). ${FIX_MAIN_ROOT_CAUSE_CONTEXT_LABEL}`,
    ]
  }
  if (!allowClosed && lookup.issue.state.toLowerCase() !== 'open') {
    return [
      `${rootCauseRef.key} is ${lookup.issue.state.toUpperCase()}: ${lookup.issue.title}. ${FIX_MAIN_ROOT_CAUSE_CONTEXT_LABEL}`,
    ]
  }
  return []
}
