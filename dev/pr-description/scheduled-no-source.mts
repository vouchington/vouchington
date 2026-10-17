import { parseMarkdownSections } from 'vouchington-tooling/markdown'

import { sanitizedLines } from './sanitized-lines.mts'

// The scheduled-prompt "no closing keyword required" exception to the git-and-prs.md
// closing-reference rule pairs an exact visible line with an exact HTML comment marker so the
// check can't be satisfied by accident, and also requires the scheduled workspace-setup line.
const RELATED_ISSUES_HEADING_RE = /^##\s+Related\s+issues\s*$/i

const SCHEDULED_NO_SOURCE_VISIBLE_LINE = 'No source issue; scheduled prompt run.'
const SCHEDULED_NO_SOURCE_MARKER = '<!-- related-issues-validation: no-source-scheduled-prompt -->'
const SCHEDULED_WORKSPACE_SETUP_LINE = 'Workspace setup: Auto Harness scheduled prompt'

export function extractRelatedIssuesLines(body: string): string[] {
  const section = parseMarkdownSections(body).sections.find(candidate =>
    RELATED_ISSUES_HEADING_RE.test(`## ${candidate.heading}`),
  )
  if (section === undefined) return []
  const heading = body.split(/\r?\n/)[section.line - 1] ?? `## ${section.heading}`
  return sanitizedLines(`${heading}\n${section.content}`)
}

export function isScheduledPromptNoSourceBody(body: string): boolean {
  const bodyLines = sanitizedLines(body)
  const relatedIssuesLines = extractRelatedIssuesLines(body)

  return (
    relatedIssuesLines.some(
      (line, index) =>
        line === SCHEDULED_NO_SOURCE_VISIBLE_LINE &&
        relatedIssuesLines[index + 1] === SCHEDULED_NO_SOURCE_MARKER,
    ) && bodyLines.includes(SCHEDULED_WORKSPACE_SETUP_LINE)
  )
}
