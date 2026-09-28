import { extractRelatedIssuesLines } from './scheduled-no-source.mts'

/** Structural representation only; the caller must also establish interactive runtime context. */
export function isDirectUserRequestNoSourceBody(body: string): boolean {
  const lines = extractRelatedIssuesLines(body)
  return lines.some(
    (line, index) =>
      line === 'No source issue; direct user request.' &&
      lines[index + 1] === '<!-- related-issues-validation: no-source-direct-request -->',
  )
}
