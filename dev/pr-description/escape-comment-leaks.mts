import { ESCAPE_COMMENT_RE, parseClosingIssueReferences } from './closing-refs.mts'

const MAX_REASON_PREVIEW_LENGTH = 200
const MAX_LEAKED_REFERENCES_PER_COMMENT = 10
const MAX_REPORTED_LEAKS = 20

/**
 * GitHub's own issue-closing keyword scanner reads the raw PR body / merge commit message and does
 * not parse HTML comments — it will still close an issue referenced by a `close(s|d)`/`fix(es|ed)`/
 * `resolve(s|d)` keyword inside a `<!-- related-issues-validation: allow ... -->` escape comment's
 * free-text reason. A reason like "a later PR closes #123" therefore closes #123 on merge despite
 * the comment's intent to keep it open (this happened for real: #10937 in this repo).
 */
export function findEscapeCommentClosingKeywordLeaks(body: string): string[] {
  const leaks: string[] = []

  for (const match of body.matchAll(ESCAPE_COMMENT_RE)) {
    if (leaks.length >= MAX_REPORTED_LEAKS) break

    const reason = match.groups?.reason?.trim() ?? ''
    const leakedRefs = parseClosingIssueReferences(reason)
    if (leakedRefs.length === 0) continue

    // One bounded diagnostic per comment, not per leaked reference: a single reason otherwise
    // repeats the same PR-body-controlled reason text once per leaked reference it contains, which
    // can expand one adversarial PR body into an unbounded amount of diagnostic output.
    const keys = leakedRefs.slice(0, MAX_LEAKED_REFERENCES_PER_COMMENT).map(ref => ref.key)
    const omitted = leakedRefs.length - keys.length
    const keyList = omitted > 0 ? `${keys.join(', ')}, and ${omitted} more` : keys.join(', ')
    const truncatedReason =
      reason.length > MAX_REASON_PREVIEW_LENGTH
        ? `${reason.slice(0, MAX_REASON_PREVIEW_LENGTH)}…`
        : reason

    leaks.push(
      `The related-issues-validation escape comment's reason text contains a GitHub closing keyword referencing ${keyList} ("${truncatedReason}"). GitHub does not respect HTML comment boundaries when scanning for closing keywords, so merging this PR would close ${keyList} despite the comment's intent. Rephrase the reason so no close/fix/resolve keyword sits directly before an issue number.`,
    )
  }

  if (leaks.length >= MAX_REPORTED_LEAKS) {
    leaks.push(
      `Additional related-issues-validation escape comments also leak GitHub closing keywords beyond the first ${MAX_REPORTED_LEAKS} shown above. Rephrase every escape comment reason so no close/fix/resolve keyword sits directly before an issue number.`,
    )
  }

  return leaks
}
