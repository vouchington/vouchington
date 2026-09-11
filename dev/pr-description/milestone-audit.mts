import { formatReferenceKey, type ClosingIssueReference } from './closing-refs.mts'
import {
  formatIssueAuditMarkerHint,
  parseIssueAuditKeepOpenDecisions,
  type IssueAuditKeepOpenDecision,
} from './issue-audit-marker.mts'
import type { RunGh } from './issue-closure.mts'
import {
  findMilestoneCompletionSiblings,
  MILESTONE_COMPLETION_REMAINDER,
  type MilestoneGroup,
  type MilestoneSibling,
} from './milestone-query.mts'
import { parseNonClosingRefs } from './non-closing-refs.mts'
import type { ClosingIssueForAudit } from './validate.mts'

/**
 * Groups the issues this PR closes by (repo, milestone) — repo resolves to `auditedRepo` for a
 * same-repo close (`ClosingIssueForAudit.repo === undefined`) or the foreign repo an explicit
 * `Closes owner/other#N` names. Always lowercased so it compares cleanly against the
 * already-lowercased `repo` a foreign `ClosingIssueForAudit` carries.
 */
export function groupClosedIssuesByMilestone(
  closingIssues: ReadonlyArray<ClosingIssueForAudit>,
  auditedRepo: string,
): Map<string, MilestoneGroup> {
  const localRepo = auditedRepo.toLowerCase()
  const grouped = new Map<string, MilestoneGroup>()
  for (const { issue, repo } of closingIssues) {
    if (issue.milestone === undefined) continue
    const resolvedRepo = repo ?? localRepo
    const key = `${resolvedRepo} ${issue.milestone}`
    const group = grouped.get(key) ?? {
      milestone: issue.milestone,
      numbers: new Set<number>(),
      repo: resolvedRepo,
    }
    group.numbers.add(issue.number)
    grouped.set(key, group)
  }
  return grouped
}

// A local sibling renders as bare `#N`; a foreign one renders `owner/repo#N` via the same
// `formatReferenceKey` `closing-refs.mts` uses for every other reference key in this codebase, so
// the three disposition forms below can match by exact key rather than reimplementing the format.
function formatSiblingKey(sibling: MilestoneSibling, auditedRepo: string): string {
  if (sibling.repo === auditedRepo) return `#${sibling.number}`
  const [owner, repo] = sibling.repo.split('/')
  return formatReferenceKey({ number: sibling.number, owner, repo })
}

function formatKeepOpenKey(decision: IssueAuditKeepOpenDecision): string {
  const [owner, repo] =
    decision.repo !== undefined ? decision.repo.split('/') : [undefined, undefined]
  return formatReferenceKey({ number: decision.number, owner, repo })
}

/**
 * Every remaining sibling must be dispositioned: `Closes #N` (or a foreign `Closes owner/repo#N`),
 * a non-closing `Refs`/`Part of #N` (which `git-and-prs.md` already requires to carry a reason and
 * an issue comment — this only checks presence, not restates that requirement), or the
 * `issue-audit: keep-open` marker. All three are matched by the exact reference-key format
 * `closing-refs.mts` uses, so a foreign sibling and a foreign disposition line up byte for byte.
 *
 * `formatReferenceKey` (used by `closingRefs`/`parseNonClosingRefs`/`formatKeepOpenKey`) has no
 * concept of "the audited repo" — it renders `owner/repo#N` whenever a ref names an explicit repo,
 * even when that repo is this one. `formatSiblingKey` does have that concept and renders a local
 * sibling as bare `#N`. Without normalizing, a redundantly self-qualified disposition (e.g. `Refs
 * owner/repo#43` on `owner/repo` itself) would produce `owner/repo#43` and never match the bare
 * `#43` a local sibling renders, false-positiving as undispositioned.
 */
export function validateMilestoneSiblings(
  siblings: MilestoneSibling[],
  body: string,
  closingRefs: ClosingIssueReference[],
  repo: string,
): string[] {
  const auditedRepo = repo.toLowerCase()
  const localPrefix = `${auditedRepo}#`
  const normalizeKey = (key: string): string =>
    key.startsWith(localPrefix) ? `#${key.slice(localPrefix.length)}` : key

  const closedKeys = new Set(closingRefs.map(ref => normalizeKey(ref.key)))
  const refsKeys = new Set([...parseNonClosingRefs(body)].map(normalizeKey))
  const keptOpenKeys = new Set(
    parseIssueAuditKeepOpenDecisions(body).map(decision =>
      normalizeKey(formatKeepOpenKey(decision)),
    ),
  )

  const errors: string[] = []
  for (const sibling of siblings) {
    const key = formatSiblingKey(sibling, auditedRepo)
    if (closedKeys.has(key) || refsKeys.has(key) || keptOpenKeys.has(key)) continue
    errors.push(
      `${key} ("${sibling.title}") is an open sibling in milestone "${sibling.milestone}", which ` +
        `this PR is completing (≤ ${MILESTONE_COMPLETION_REMAINDER} issues remain). Add "Closes ` +
        `${key}", "Refs ${key}" with an explanation and issue comment, or ` +
        `${formatIssueAuditMarkerHint(key)} if it should stay open.`,
    )
  }
  return errors
}

/**
 * Composition point for `dev/pr-description.mts`: bundles milestone-sibling enumeration + decision
 * policy behind the `(body, closingRefs, closingIssues) => Promise<string[]>` shape `validate.mts`
 * expects. `closingIssues` pairs each closed issue with the repo its closing ref named (or
 * `undefined` for the audited repo), so grouping by milestone needs no extra `gh` call.
 */
export function createMilestoneAuditor(
  runGh: RunGh,
  repo: string,
): (
  body: string,
  closingRefs: ClosingIssueReference[],
  closingIssues: ClosingIssueForAudit[],
) => Promise<string[]> {
  return async (body, closingRefs, closingIssues) => {
    const groups = groupClosedIssuesByMilestone(closingIssues, repo)
    if (groups.size === 0) return []
    const siblings = await findMilestoneCompletionSiblings(runGh, groups)
    if (siblings.length === 0) return []
    return validateMilestoneSiblings(siblings, body, closingRefs, repo)
  }
}
