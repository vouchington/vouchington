import {
  validatePrBody,
  type PrBodyValidationOptions,
  type PrBodyValidationResult,
} from './validate-body.mts'
export {
  validatePrBody,
  type PrBodyValidationOptions,
  type PrBodyValidationResult,
} from './validate-body.mts'
import {
  type ClosingIssueReference,
  type IssueReferenceLookup,
  type ReferencedIssue,
  parseClosingIssueReferences,
  validateResolvedIssueReferences,
} from './closing-refs.mts'
import {
  extractFixMainInterimClassifierRootCauseRef,
  validateFixMainRootCauseRef,
} from './scheduled-no-source.mts'

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

export type IssueReferenceValidationOptions = PrBodyValidationOptions & {
  closureResolver?: IssueClosureResolver
  milestoneAuditor?: (
    body: string,
    closingRefs: ClosingIssueReference[],
    closingIssues: ClosingIssueForAudit[],
  ) => Promise<string[]>
  projectAuditor?: (closingIssues: ClosingIssueForAudit[]) => Promise<string[]>
  supersessionAuditor?: (body: string, closingRefs: ClosingIssueReference[]) => Promise<string[]>
  targetPullRequest?: PullRequestIdentity
}

export async function validatePrBodyWithIssueReferences(
  body: string,
  resolveIssueReference: IssueReferenceResolver,
  options: IssueReferenceValidationOptions = {},
): Promise<PrBodyValidationResult> {
  const result = validatePrBody(body, options)
  if (!result.ok) return result

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

  const [supersessionErrors, milestoneErrors, projectAdvisories] = await Promise.all([
    options.supersessionAuditor?.(body, refs) ?? Promise.resolve([]),
    options.milestoneAuditor?.(body, refs, closingIssues) ?? Promise.resolve([]),
    options.projectAuditor?.(closingIssues) ?? Promise.resolve([]),
  ])
  result.errors.push(...supersessionErrors, ...milestoneErrors)
  result.advisories = projectAdvisories
  result.ok = result.errors.length === 0
  return result
}
