import { execFileSync } from 'node:child_process'

import {
  type ClosingIssueReference,
  type IssueReferenceLookup,
  parseGitHubIssueApiResponse,
  parseClosingIssueReferences,
  validateResolvedIssueReferences,
} from '../../pr-description/closing-refs.mts'
import {
  extractFixMainInterimClassifierRootCauseRef,
  isFixMainInterimClassifierNoClosingRefBody,
  validateFixMainRootCauseRef,
} from '../../pr-description/scheduled-no-source.mts'
import type { BlockDecision } from './core.mts'

export type GitHubCommandContext = {
  env?: Record<string, string | undefined>
  repo?: string | undefined
}

export type GitHubWorkflowPolicyOptions = {
  resolveClosingIssueReference?: (
    ref: ClosingIssueReference,
    cwd: string,
    context: GitHubCommandContext,
  ) => IssueReferenceLookup
  /**
   * Injectable in place of the real `gh api repos/{owner}/{repo}/stacks` call that backs the `gh
   * stack init` abandonment guard (github-stack-topology.mts) — same shape of seam as
   * resolveClosingIssueReference above, for tests that need canned topology instead of a live API
   * call. Returns the parsed JSON response, or undefined to simulate a failed/unresolvable call.
   */
  resolveStackTopology?: (cwd: string, env: Record<string, string | undefined>) => unknown
  validateClosingIssueReferences?: boolean
  /**
   * Whether this tool call is running inside GitHub Actions automation (GITHUB_ACTIONS/CI set).
   * Only the merge-authority branches in findGitHubWorkflowBlock read this. Defaults to
   * DEFAULT_AUTOMATION_CONTEXT (block, see core.mts) when omitted, so callers that don't pass it
   * — tests, direct invocations — keep the strict pre-existing behavior. Only the wired
   * pre-tool-use.mts entry point computes this from real process.env; every other layer stays a
   * pure function. See docs/development/merge-authority.md.
   */
  automationContext?: boolean
  /**
   * The GitHub owners the session's own checkout belongs to (lazily read; undefined when
   * unprovable) — see sessionHomeOwners in github-checkout-owners.mts. When set, the Vouchington PR
   * and issue content rules skip a gh command that provably targets a repository outside them — see
   * github-content-rule-scope.mts. Merge authority and the gh stack policy never read it. Omitted —
   * tests, direct invocations — keeps every rule; only the wired pre-tool-use.mts entry point
   * supplies it, from its own checkout.
   */
  sessionOwners?: () => ReadonlySet<string> | undefined
}

export function findClosingIssueReferenceBlock(
  body: string,
  cwd: string,
  options: GitHubWorkflowPolicyOptions,
  context: GitHubCommandContext = {},
): BlockDecision | null {
  if (options.validateClosingIssueReferences !== true) {
    return null
  }

  const refs = parseClosingIssueReferences(body)
  let currentRepo: string | undefined
  const resolver =
    options.resolveClosingIssueReference ??
    ((ref: ClosingIssueReference, resolverCwd: string) =>
      resolveClosingIssueReferenceSync(
        ref,
        resolverCwd,
        () => {
          currentRepo ??= context.repo ?? currentRepoSync(resolverCwd, context.env)
          return currentRepo
        },
        context.env,
      ))
  const lookups = new Map<string, IssueReferenceLookup>()
  for (const ref of refs) {
    lookups.set(ref.key, resolver(ref, cwd, context))
  }

  const result = validateResolvedIssueReferences(body, refs, lookups)
  const errors = [...result.errors]

  const rootCauseRef = extractFixMainInterimClassifierRootCauseRef(body)
  const rootCauseLookup =
    rootCauseRef === undefined ? undefined : resolver(rootCauseRef, cwd, context)
  errors.push(...validateFixMainRootCauseRef(rootCauseRef, rootCauseLookup))

  if (errors.length === 0) {
    return null
  }

  return {
    reason: `PR body closing issue references are invalid:\n${errors
      .map(error => `- ${error}`)
      .join('\n')}`,
  }
}

// The interim-classifier exception waives the closing keyword only because its Refs entry
// substitutes for it (scheduled-no-source.mts) — that substitution requires the ref to actually
// get verified by findClosingIssueReferenceBlock above, which an unresolvable repository (e.g.
// `cd "$WORKTREE"`, no `--repo`) would otherwise skip. Ordinary `Closes #N` refs don't need this:
// GitHub closes them mechanically regardless of whether this hook double-checked.
export function findUnresolvableFixMainExceptionBlock(
  body: string,
  canResolveClosingIssueReferences: boolean,
  validateClosingIssueReferences: boolean,
): BlockDecision | null {
  if (
    validateClosingIssueReferences &&
    isFixMainInterimClassifierNoClosingRefBody(body) &&
    !canResolveClosingIssueReferences
  ) {
    return {
      reason:
        "The Fix Main interim-classifier exception requires an existing open root-cause issue, but this command's effective repository could not be determined (an unresolved `cd` target and no `--repo`), so its `Refs #N` entry cannot be verified. Pass `--repo owner/repo` or resolve the working directory to a literal path.",
    }
  }

  return null
}

function resolveClosingIssueReferenceSync(
  ref: ClosingIssueReference,
  cwd: string,
  currentRepo: () => string,
  env: Record<string, string | undefined> = {},
): IssueReferenceLookup {
  try {
    const repo =
      ref.owner !== undefined && ref.repo !== undefined ? `${ref.owner}/${ref.repo}` : currentRepo()
    const json = execFileSync('gh', ['api', `repos/${repo}/issues/${ref.number}`], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 10_000,
    })
    return { issue: parseGitHubIssueApiResponse(json), ok: true }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : String(err),
      ok: false,
    }
  }
}

function currentRepoSync(cwd: string, env: Record<string, string | undefined> = {}): string {
  const json = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 10_000,
  })
  const parsed = JSON.parse(json) as { nameWithOwner?: string }
  if (parsed.nameWithOwner === undefined || parsed.nameWithOwner.trim() === '') {
    throw new Error('could not determine current GitHub repository')
  }

  return parsed.nameWithOwner
}
