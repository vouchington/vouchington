/**
 * `<!-- issue-audit: keep-open [owner/repo]#N because <classification>: <reason> -->` — the
 * sibling to `ESCAPE_COMMENT_RE` in `closing-refs.mts`. That marker means "close this anyway"; this
 * one means "this issue was audited and deliberately stays open." Shared by `supersession.mts`
 * (removed-surface search hits, always same-repo) and `milestone-audit.mts` (remaining milestone
 * siblings, which may name a foreign repo) so both dispositions read the same grammar. The
 * `owner/repo` prefix is optional: omitted means the audited repo itself.
 */

export type AuditClassification =
  | 'evidence-gated'
  | 'live-credential-required'
  | 'locally-actionable'
  | 'unrelated'

export type IssueAuditKeepOpenDecision = {
  classification: AuditClassification
  number: number
  reason: string
  repo: string | undefined
}

const VALID_CLASSIFICATIONS: ReadonlySet<AuditClassification> = new Set([
  'evidence-gated',
  'live-credential-required',
  'locally-actionable',
  'unrelated',
])

// `reason` has no surrounding `\s*` — those overlap with the dotall `.*?` on the same whitespace
// characters and cause catastrophic backtracking on an unterminated marker (no closing `-->`), since
// three quantifiers can redundantly split the same run of trailing whitespace. `parseIssueAuditKeepOpenDecisions` already `.trim()`s the captured reason, so dropping them is behavior-preserving.
const ISSUE_AUDIT_KEEP_OPEN_RE =
  /<!--\s*issue-audit:\s*keep-open\s+(?:(?<ownerRepo>[\w.-]+\/[\w.-]+))?#(?<number>\d+)\s+because\s+(?<classification>[\w-]+):(?<reason>.*?)-->/gis

export function isValidAuditClassification(value: string): value is AuditClassification {
  return VALID_CLASSIFICATIONS.has(value as AuditClassification)
}

/** Parses every well-formed `issue-audit: keep-open` marker in a PR body. A marker with an
 * unrecognized classification or an empty reason is skipped — callers treat the issue number as
 * undispositioned, which surfaces as a normal missing-disposition error rather than a parse error. */
export function parseIssueAuditKeepOpenDecisions(body: string): IssueAuditKeepOpenDecision[] {
  const decisions: IssueAuditKeepOpenDecision[] = []

  for (const match of body.matchAll(ISSUE_AUDIT_KEEP_OPEN_RE)) {
    const number = Number(match.groups?.number)
    const classification = match.groups?.classification
    const reason = match.groups?.reason?.trim()
    const repo = match.groups?.ownerRepo?.toLowerCase()
    if (!Number.isSafeInteger(number)) continue
    if (classification === undefined || !isValidAuditClassification(classification)) continue
    if (reason === undefined || reason.length === 0) continue
    decisions.push({ classification, number, reason, repo })
  }

  return decisions
}

/** `key` is a pre-formatted reference (`#N` or `owner/repo#N`, `closing-refs.mts`'s
 * `formatReferenceKey` format) rather than a bare number, so a foreign hint renders qualified. */
export function formatIssueAuditMarkerHint(key: string): string {
  return `<!-- issue-audit: keep-open ${key} because <classification>: <reason> -->`
}
