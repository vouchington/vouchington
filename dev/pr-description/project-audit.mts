import type { ClosingIssueReference } from './closing-refs.mts'
import type { RunGh } from './issue-closure.mts'
import {
  fetchIssueProjectMemberships,
  findProjectCompletionSiblings,
  type ProjectGroup,
  type ProjectRef,
  type ProjectSibling,
} from './project-query.mts'
import type { ClosingIssueForAudit } from './validate.mts'

type ClosingIssueProjects = {
  closingKey: string
  projects: ProjectRef[]
}

/**
 * Groups this PR's closing issues by the open project(s) each belongs to. An issue may belong to
 * more than one open project (see `fetchIssueProjectMemberships`) — every one it belongs to gets
 * its own group entry here, audited independently rather than picked arbitrarily.
 */
export function groupClosedIssuesByProject(
  entries: ReadonlyArray<ClosingIssueProjects>,
): Map<string, ProjectGroup> {
  const grouped = new Map<string, ProjectGroup>()
  for (const { closingKey, projects } of entries) {
    for (const project of projects) {
      const group = grouped.get(project.id) ?? { keys: new Set<string>(), project }
      group.keys.add(closingKey)
      grouped.set(project.id, group)
    }
  }
  return grouped
}

/**
 * Purely advisory formatting: unlike `validateMilestoneSiblings`, this never checks the PR body for
 * a disposition marker — there is nothing to disposition. `createProjectAuditor`'s output never
 * reaches `result.errors`; it is printed to stderr and never blocks `validate`.
 */
export function formatProjectAdvisories(siblings: ProjectSibling[]): string[] {
  return siblings.map(
    sibling =>
      `${sibling.key} ("${sibling.title}") is still open in project "${sibling.projectTitle}" ` +
      `(${sibling.projectUrl}), which this PR is nearly completing.`,
  )
}

/** Formats advisory strings for stderr; `''` when there is nothing to show. */
export function formatProjectAdvisoryReport(advisories: readonly string[]): string {
  if (advisories.length === 0) return ''
  return [
    'Project completion advisory (non-blocking, no disposition required):',
    ...advisories.map(advisory => `  - ${advisory}`),
    '',
  ].join('\n')
}

async function resolveClosingIssueProjects(
  runGh: RunGh,
  issue: ClosingIssueForAudit,
  auditedOwner: string,
  auditedRepo: string,
): Promise<ClosingIssueProjects & { scopeErrorMessage: string | undefined }> {
  const [owner, repo] =
    issue.repo === undefined ? [auditedOwner, auditedRepo] : issue.repo.split('/')
  const closingKey = `${owner}/${repo}#${issue.issue.number}`.toLowerCase()
  const result = await fetchIssueProjectMemberships(
    runGh,
    owner ?? auditedOwner,
    repo ?? auditedRepo,
    issue.issue.number,
  )
  if (!result.ok) {
    return {
      closingKey,
      projects: [],
      scopeErrorMessage: result.scopeError ? result.error : undefined,
    }
  }
  return { closingKey, projects: result.projects, scopeErrorMessage: undefined }
}

/**
 * Composition point wired into `validate.mts` next to `createMilestoneAuditor`, same
 * `(body, closingRefs, closingIssues) => Promise<string[]>` shape — but fire-and-forget: this
 * writes its own notices to stderr and `validate.mts` never touches what it resolves to (the
 * resolved value only exists so tests can assert on it). A missing/insufficient `project` scope, or
 * a GraphQL call that fails with a scope error, collapses the whole audit to a single skipped-audit
 * notice — "skip and report", never worked around — instead of failing.
 */
export function createProjectAuditor(
  runGh: RunGh,
  repo: string,
): (
  body: string,
  closingRefs: ClosingIssueReference[],
  closingIssues: ClosingIssueForAudit[],
) => Promise<string[]> {
  const [auditedOwner, auditedRepo] = repo.split('/')
  return async (_body, _closingRefs, closingIssues) => {
    if (closingIssues.length === 0) return []

    const resolved = await Promise.all(
      closingIssues.map(issue =>
        resolveClosingIssueProjects(runGh, issue, auditedOwner, auditedRepo),
      ),
    )
    const scopeFailure = resolved.find(entry => entry.scopeErrorMessage !== undefined)
    if (scopeFailure !== undefined) {
      const advisories = [`Project completion audit skipped: ${scopeFailure.scopeErrorMessage}`]
      process.stderr.write(formatProjectAdvisoryReport(advisories))
      return advisories
    }

    const groups = groupClosedIssuesByProject(resolved)
    if (groups.size === 0) return []
    const siblings = await findProjectCompletionSiblings(runGh, groups)
    if (siblings.length === 0) return []
    const advisories = formatProjectAdvisories(siblings)
    process.stderr.write(formatProjectAdvisoryReport(advisories))
    return advisories
  }
}
