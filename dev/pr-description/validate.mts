import {
  type ClosingIssueReference,
  type IssueReferenceLookup,
  type ReferencedIssue,
  hasClosingIssueReference,
  parseClosingIssueReferences,
  validateResolvedIssueReferences,
} from './closing-refs.mts'
import { findEscapeCommentClosingKeywordLeaks } from './escape-comment-leaks.mts'
import {
  extractFixMainInterimClassifierRootCauseRef,
  isFixMainInterimClassifierNoClosingRefBody,
  isScheduledPromptNoSourceBody,
  validateFixMainRootCauseRef,
} from './scheduled-no-source.mts'
import { githubBodyLengthError } from '../github-body-length.mts'

export type PrBodyValidationResult = {
  errors: string[]
  referencedIssues: ReferencedIssue[]
  ok: boolean
}

export type IssueReferenceResolver = (ref: ClosingIssueReference) => Promise<IssueReferenceLookup>

// `repo === undefined` means the closing ref named no explicit owner/repo, i.e. it closes an issue
// in the audited repo itself. An explicit `Closes owner/other#N` carries that combined string, so
// auditors can key by (repo, ...) without re-deriving it from `ClosingIssueReference` themselves.
export type ClosingIssueForAudit = {
  issue: ReferencedIssue
  repo: string | undefined
}

export type PullRequestIdentity = {
  mergeCommitOid: string | undefined
  number: number
  owner: string
  repo: string
  state: string
}

export type PullRequestReference = Pick<PullRequestIdentity, 'number' | 'owner' | 'repo'>

export type ClosureLookup =
  | { closer: PullRequestReference | null; ok: true }
  | { error: string; ok: false }

export type IssueClosureResolver = (ref: ClosingIssueReference) => Promise<ClosureLookup>

export type IssueReferenceValidationOptions = {
  closureResolver?: IssueClosureResolver
  milestoneAuditor?: (
    body: string,
    closingRefs: ClosingIssueReference[],
    closingIssues: ClosingIssueForAudit[],
  ) => Promise<string[]>
  supersessionAuditor?: (body: string, closingRefs: ClosingIssueReference[]) => Promise<string[]>
  targetPullRequest?: PullRequestIdentity
}

const RELATED_ISSUES_RE = /^##\s+Related\s+issues\s*$/im
const WORKSPACE_SETUP_RE = /^\s*Workspace\s+setup\s*:/im
const PROVENANCE_RULES = [
  { label: 'Agent:', re: /^\s*Agent\s*:\s*\S/im },
  { label: 'Device:', re: /^\s*Device\s*:\s*\S/im },
  { label: 'Worktree:', re: /^\s*Worktree\s*:\s*\S/im },
] as const

/** Split body by top-level headings and return the Related issues section content. */
function extractRelatedIssuesSection(body: string): string {
  const sections = body.split(/^(?=##\s)/m)
  return sections.find(s => RELATED_ISSUES_RE.test(s.split('\n')[0])) ?? ''
}

export function validatePrBody(body: string): PrBodyValidationResult {
  const bodyLengthError = githubBodyLengthError(body)
  if (bodyLengthError) return { errors: [bodyLengthError], ok: false, referencedIssues: [] }

  const errors: string[] = []

  if (!RELATED_ISSUES_RE.test(body)) {
    errors.push(
      'PR body must include a "## Related issues" section (e.g. a heading followed by "Closes #123"). See .agents/skills/agent-workflow/git-and-prs.md.',
    )
  }

  const relatedIssuesSection = extractRelatedIssuesSection(body)
  if (
    relatedIssuesSection &&
    !hasClosingIssueReference(relatedIssuesSection) &&
    !isScheduledPromptNoSourceBody(body) &&
    !isFixMainInterimClassifierNoClosingRefBody(body)
  ) {
    errors.push(
      'PR body must include at least one GitHub closing keyword (e.g. "Closes #123") in the "## Related issues" section, or the exact scheduled-prompt no-source representation, or the exact Fix Main interim-classifier no-closing-ref representation alongside a Refs entry. See .agents/skills/agent-workflow/git-and-prs.md.',
    )
  }

  if (!WORKSPACE_SETUP_RE.test(body)) {
    errors.push(
      'PR body must include a "Workspace setup:" line (e.g. "Workspace setup: ./dev/initialize monorepo"). See .agents/skills/agent-workflow/start-of-work.md.',
    )
  }

  for (const rule of PROVENANCE_RULES) {
    if (!rule.re.test(body)) {
      errors.push(`PR body must include "${rule.label}" line.`)
    }
  }

  errors.push(...findEscapeCommentClosingKeywordLeaks(body))

  return { errors, ok: errors.length === 0, referencedIssues: [] }
}

export async function validatePrBodyWithIssueReferences(
  body: string,
  resolveIssueReference: IssueReferenceResolver,
  options: IssueReferenceValidationOptions = {},
): Promise<PrBodyValidationResult> {
  const result = validatePrBody(body)
  if (!result.ok) {
    return result
  }

  const refs = parseClosingIssueReferences(body)
  const lookups = new Map<string, IssueReferenceLookup>()
  await Promise.all(
    refs.map(async ref => {
      lookups.set(ref.key, await resolveIssueReference(ref))
    }),
  )

  const target = options.targetPullRequest
  const targetIsMerged = target?.state.toUpperCase() === 'MERGED'

  const rootCauseRef = extractFixMainInterimClassifierRootCauseRef(body)
  const rootCauseLookup =
    rootCauseRef === undefined ? undefined : await resolveIssueReference(rootCauseRef)
  result.errors.push(...validateFixMainRootCauseRef(rootCauseRef, rootCauseLookup, targetIsMerged))

  const allowedClosedReferences = new Set<string>()
  if (targetIsMerged && options.closureResolver !== undefined) {
    await Promise.all(
      refs.map(async ref => {
        const lookup = lookups.get(ref.key)
        if (lookup?.ok !== true || lookup.issue.state.toLowerCase() === 'open') return
        const closure = await options.closureResolver?.(ref)
        if (
          closure?.ok === true &&
          closure.closer !== null &&
          closure.closer.number === target.number &&
          closure.closer.owner.toLowerCase() === target.owner.toLowerCase() &&
          closure.closer.repo.toLowerCase() === target.repo.toLowerCase()
        ) {
          allowedClosedReferences.add(ref.key)
        }
      }),
    )
  }
  const resolved = validateResolvedIssueReferences(
    body,
    refs,
    lookups,
    allowedClosedReferences,
    targetIsMerged,
  )
  result.errors.push(...resolved.errors)
  result.referencedIssues.push(...resolved.issues)

  // An already-closed reference only counts as "closed by this PR" when it was closed by the
  // target PR itself (`allowedClosedReferences`, merged-PR provenance only) — not when it is
  // merely waived via a `related-issues-validation: allow` escape comment, which documents an
  // unrelated pre-existing closure rather than this PR's own action. Paired with the ref's own
  // repo (not just the bare issue) so a cross-repo `Closes owner/other#N` audits against `other`,
  // not the audited repo.
  const closingIssues: ClosingIssueForAudit[] = []
  for (const ref of refs) {
    const lookup = lookups.get(ref.key)
    if (lookup?.ok !== true) continue
    const isOpen = lookup.issue.state.toLowerCase() === 'open'
    if (isOpen || allowedClosedReferences.has(ref.key)) {
      const repo =
        ref.owner !== undefined && ref.repo !== undefined ? `${ref.owner}/${ref.repo}` : undefined
      closingIssues.push({ issue: lookup.issue, repo })
    }
  }

  const auditErrors = await Promise.all([
    options.supersessionAuditor?.(body, refs) ?? Promise.resolve([]),
    options.milestoneAuditor?.(body, refs, closingIssues) ?? Promise.resolve([]),
  ])
  result.errors.push(...auditErrors.flat())

  result.ok = result.errors.length === 0
  return result
}
