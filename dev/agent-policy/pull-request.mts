import { processDiffCommand, runGh } from 'vouchington-tooling/gh-cli'
import { fetchIssueProjectMemberships } from 'vouchington-tooling/github-projects'

import { findHandRolledStackBaseBlock } from '../codex-hooks/policy/github-configured-base.mts'
import { checkLargeDiff, type LargeDiffOptions } from './large-diff.mts'
import { parseGitHubIssueApiResponse } from '../pr-description/closing-refs.mts'
import { formatReferencedIssueSummary } from '../pr-description/referenced-issue-summary.mts'
import { createMilestoneAuditor } from '../pr-description/milestone-audit.mts'
import { createGhPackageJsonReader } from '../pr-description/package-json-source.mts'
import { createProjectAuditor } from '../pr-description/project-audit.mts'
import { readPullRequestPatch } from '../pr-description/pull-request-patch.mts'
import {
  createClosingIssueReferenceResolver,
  createIssueClosureResolver,
  currentRepo,
  parsePullRequestIdentity,
} from '../pr-description/related-issues.mts'
import { createSupersessionAuditor } from '../pr-description/supersession.mts'
import { parsePullRequestRefOids } from '../pr-description/supersession-hints.mts'
import {
  validatePrBody,
  validatePrBodyWithIssueReferences,
  type IssueReferenceValidationOptions,
} from '../pr-description/validate.mts'

export type PullRequestPolicyInput = {
  title: string
  body: string
  base: string
  head: string
  mode: 'interactive' | 'autonomous'
  /** Set on update; absent on create. */
  pr?: number
}

// pr_create passes all three; retrospective_save passes `{}`.
export type PullRequestDefaultsInput = {
  title?: string
  base?: string
  relatedIssues?: { number: number; relation: 'closes' | 'refs'; reason: string }[]
}

export type PullRequestDefaults = {
  milestone?: string
  project?: string
  labels?: string[]
  repositories?: string[]
}

type PolicyResult = { errors: string[]; warnings?: string[] }

// Create (`pr` unset) matches the CLI `create`: the stack-base rule, the body content policy, and
// closing-ref resolution. Update (`pr` set) matches `validate <pr>`: it adds the milestone and
// project completion audits, closure provenance, and the supersession audit, which need a real PR.
export async function validatePullRequest(
  input: PullRequestPolicyInput,
  largeDiff: LargeDiffOptions = {},
): Promise<PolicyResult> {
  const automationContext = input.mode === 'autonomous'
  const stackBase =
    input.pr === undefined
      ? findHandRolledStackBaseBlock('create', ['--base', input.base], undefined)
      : null
  const baseErrors = stackBase === null ? [] : [stackBase.reason]
  // Content-policy failures need no GitHub call, so report them before touching gh.
  const content = validatePrBody(input.body, { automationContext })
  if (!content.ok) return { errors: [...content.errors, ...baseErrors] }
  const warnings: string[] = []
  const options: IssueReferenceValidationOptions = { automationContext }
  const sizeErrors: string[] = []
  if (input.pr === undefined) {
    const size = await checkLargeDiff(input.base, input.body, largeDiff)
    sizeErrors.push(...size.errors)
    warnings.push(...size.warnings)
  }
  if (input.pr !== undefined) {
    const repo = await currentRepo(runGh)
    options.milestoneAuditor = createMilestoneAuditor(runGh, repo)
    options.projectAuditor = createProjectAuditor(runGh, repo)
    const pr = String(input.pr)
    const prJson = await runGh([
      'pr',
      'view',
      pr,
      '--json',
      'mergeCommit,number,state,url,baseRefOid,headRefOid',
    ])
    const target = parsePullRequestIdentity(prJson)
    const { baseRefOid, headRefOid } = parsePullRequestRefOids(prJson)
    const patch = await readPullRequestPatch(
      onBlock => processDiffCommand({ executable: 'gh', args: ['pr', 'diff', pr] }, onBlock),
      runGh,
      target,
    )
    if (patch.source === 'files-api')
      warnings.push(
        'GitHub refused the oversized unified PR diff; supersession validation used files API metadata. Files whose patches GitHub omits skip removed-export content checks.',
      )
    options.closureResolver = createIssueClosureResolver(runGh, target)
    options.targetPullRequest = target
    options.supersessionAuditor = createSupersessionAuditor(
      runGh,
      repo,
      patch.summary,
      createGhPackageJsonReader(runGh, repo, baseRefOid, headRefOid),
    )
  }
  const result = await validatePrBodyWithIssueReferences(
    input.body,
    createClosingIssueReferenceResolver(runGh),
    options,
  )
  const summary = formatReferencedIssueSummary(result.referencedIssues).trim()
  if (summary) warnings.push(summary)
  warnings.push(...result.advisories)
  const errors = [...result.errors, ...baseErrors, ...sizeErrors]
  return warnings.length > 0 ? { errors, warnings } : { errors }
}

// The CLI never set a milestone, project, or label on create; agents did it by hand. These
// defaults inherit the milestone and the (single, open) project of the first related issue that
// has one, closing issues before refs. Anything unresolvable is simply omitted.
export async function pullRequestDefaults(
  input?: PullRequestDefaultsInput,
): Promise<PullRequestDefaults> {
  const defaults: PullRequestDefaults = { repositories: ['vouchington/vouchington'] }
  const ordered = (input?.relatedIssues ?? []).toSorted(
    (a, b) => Number(b.relation === 'closes') - Number(a.relation === 'closes'),
  )
  if (ordered.length === 0) return defaults
  try {
    const repo = await currentRepo(runGh)
    const [owner, name] = repo.split('/') as [string, string]
    const settled = await Promise.allSettled(
      ordered.map(async ({ number }) => {
        const json = await runGh(['api', `repos/${repo}/issues/${number}`])
        const memberships = await fetchIssueProjectMemberships(runGh, owner, name, number)
        return {
          milestone: parseGitHubIssueApiResponse(json).milestone,
          project:
            memberships.ok && memberships.projects.length === 1
              ? memberships.projects[0]!.title
              : undefined,
        }
      }),
    )
    // One inaccessible issue must not discard what the others resolved.
    const found = settled.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
    const milestone = found.find(item => item.milestone !== undefined)?.milestone
    const project = found.find(item => item.project !== undefined)?.project
    if (milestone !== undefined) defaults.milestone = milestone
    if (project !== undefined) defaults.project = project
  } catch {
    // Defaults are advisory; the agent can still set metadata explicitly.
  }
  return defaults
}
