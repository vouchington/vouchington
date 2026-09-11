import { parseClosingIssueReferences, type ClosingIssueReference } from './closing-refs.mts'
import {
  formatIssueAuditMarkerHint,
  parseIssueAuditKeepOpenDecisions,
  type IssueAuditKeepOpenDecision,
} from './issue-audit-marker.mts'
import type { RunGh } from './issue-closure.mts'
import { findRemovedScripts, type PackageJsonReader } from './removed-scripts.mts'
import {
  buildRemovalVocabulary,
  parseChangedPackageJsonPaths,
  parseRemovedSurfaces,
  type RemovedSurface,
} from './removed-surfaces.mts'
import { formatHints } from './related-issues.mts'

// `readPackageJson` is required, not optional: an accidentally-omitted reader would silently
// disable script-removal detection again — the exact "inert on real manifests" bug #8779 is about.
async function buildRemovalTerms(
  patch: string,
  readPackageJson: PackageJsonReader,
): Promise<string[]> {
  const surfaces: RemovedSurface[] = parseRemovedSurfaces(patch)
  surfaces.push(...(await findRemovedScripts(parseChangedPackageJsonPaths(patch), readPackageJson)))
  return buildRemovalVocabulary(surfaces).terms
}

export type SupersessionHit = {
  matchedTerm: string
  number: number
  title: string
  url: string
}

/**
 * One term per query, modeled on `duplicateSearchArgs` (`dev/agent-issue-labels/batch/taxonomy.mts`).
 * `--state open` is deliberate: an already-closed originating issue must never surface here.
 * No `in:title` — the removed surface usually appears in the issue body, not its title.
 */
export function buildSupersessionSearchArgs(repo: string, term: string): string[] {
  return [
    'issue',
    'list',
    '--repo',
    repo,
    '--search',
    term,
    '--state',
    'open',
    '--json',
    'number,title,url',
    '--limit',
    '10',
  ]
}

type RawSupersessionCandidate = { number: number; title: string; url: string }

/**
 * Sequential by design (not `Promise.all`): OR-batching a single query would collapse the cost but
 * destroys per-term attribution, so the error message could no longer name the matching removed
 * symbol. Zero calls when `terms` is empty (a PR with no deletions).
 */
export async function findSupersessionHits(
  runGh: RunGh,
  repo: string,
  terms: string[],
): Promise<SupersessionHit[]> {
  const byNumber = new Map<number, SupersessionHit>()

  for (const term of terms) {
    // oxlint-disable-next-line no-await-in-loop -- sequential by design, see comment above
    const json = await runGh(buildSupersessionSearchArgs(repo, term))
    const candidates = JSON.parse(json) as RawSupersessionCandidate[]
    for (const candidate of candidates) {
      if (!byNumber.has(candidate.number))
        byNumber.set(candidate.number, { matchedTerm: term, ...candidate })
    }
  }

  return [...byNumber.values()]
}

export type SupersessionDecision =
  | { decision: 'close'; number: number }
  | ({ decision: 'keep-open' } & IssueAuditKeepOpenDecision)

/** A `close` decision is just an existing `Closes #N` — reuse `parseClosingIssueReferences`, no
 * new syntax. A `keep-open` decision is the `issue-audit` marker. */
export function parseAuditDecisions(body: string): SupersessionDecision[] {
  const closes: SupersessionDecision[] = parseClosingIssueReferences(body).map(ref => ({
    decision: 'close',
    number: ref.number,
  }))
  const keepOpen: SupersessionDecision[] = parseIssueAuditKeepOpenDecisions(body).map(d => ({
    decision: 'keep-open',
    ...d,
  }))
  return [...closes, ...keepOpen]
}

// A ref with no explicit owner/repo closes an issue in the audited repo by definition; an explicit
// cross-repo ref (`owner/other-repo#123`) only counts here if it names the audited repo itself —
// otherwise its number is coincidental and must not clear a same-repo hit for the same number.
function closesAuditedRepo(ref: ClosingIssueReference, repo: string): boolean {
  if (ref.owner === undefined || ref.repo === undefined) return true
  return `${ref.owner}/${ref.repo}` === repo.toLowerCase()
}

/**
 * Every hit must be dispositioned: closed by this PR, or kept open with a reasoned
 * `issue-audit: keep-open` marker. `closingRefs` is accepted separately (rather than re-derived
 * from `decisions`) so callers that already parsed `Closes #N` for the outer validation pass don't
 * pay to parse the body twice.
 */
export function validateAuditHits(
  repo: string,
  hits: SupersessionHit[],
  decisions: SupersessionDecision[],
  closingRefs: ClosingIssueReference[],
): string[] {
  const closedNumbers = new Set<number>()
  for (const ref of closingRefs) {
    if (closesAuditedRepo(ref, repo)) closedNumbers.add(ref.number)
  }
  // A `keep-open other/repo#5` marker names a foreign issue and must not clear a LOCAL hit `#5` —
  // the same coincidental-number guard `closesAuditedRepo` already applies to `Closes`.
  const keptOpenNumbers = new Set<number>()
  for (const decision of decisions) {
    if (decision.decision !== 'keep-open') continue
    if (decision.repo !== undefined && decision.repo !== repo.toLowerCase()) continue
    keptOpenNumbers.add(decision.number)
  }

  const errors: string[] = []
  for (const hit of hits) {
    if (closedNumbers.has(hit.number) || keptOpenNumbers.has(hit.number)) continue
    errors.push(
      `#${hit.number} ("${hit.title}") matches removed surface "${hit.matchedTerm}" and may be ` +
        `superseded by this PR. Add "Closes #${hit.number}" if this PR resolves it, or ` +
        `${formatIssueAuditMarkerHint(`#${hit.number}`)} if it should stay open.`,
    )
  }

  return errors
}

/**
 * Composition point for `dev/pr-description.mts`: bundles vocabulary building, search, and decision
 * policy behind the `(body, closingRefs) => Promise<string[]>` shape `validate.mts` expects, so the
 * CLI only wires `runGh`, `repo`, and a raw diff `patch` — no auditor internals leak into the CLI.
 */
export function createSupersessionAuditor(
  runGh: RunGh,
  repo: string,
  patch: string,
  readPackageJson: PackageJsonReader,
): (body: string, closingRefs: ClosingIssueReference[]) => Promise<string[]> {
  return async (body, closingRefs) => {
    const terms = await buildRemovalTerms(patch, readPackageJson)
    if (terms.length === 0) return []
    const hits = await findSupersessionHits(runGh, repo, terms)
    return validateAuditHits(repo, hits, parseAuditDecisions(body), closingRefs)
  }
}

/**
 * Advisory-only counterpart for `create`/`update`: same vocabulary and search as the blocking
 * `validate <pr>` auditor, but never throws — a search failure must not block drafting a PR body.
 */
export async function runAdvisorySupersessionSearch(
  runGh: RunGh,
  repo: string,
  diff: string,
  readPackageJson: PackageJsonReader,
): Promise<string> {
  try {
    const terms = await buildRemovalTerms(diff, readPackageJson)
    if (terms.length === 0) return ''
    return formatHints(await findSupersessionHits(runGh, repo, terms))
  } catch {
    return ''
  }
}
