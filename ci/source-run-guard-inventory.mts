import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

import { parsedDependabot } from '../.github/test-helpers/fix-dependabot.test-helpers.mts'
import { parsedMain } from '../.github/test-helpers/fix-main.test-helpers.mts'

export type WorkflowJobLike = {
  if?: string
  uses?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
  steps?: Array<{
    id?: string
    run?: string
    if?: string
    env?: Record<string, string>
    with?: Record<string, unknown>
  }>
}

export type WorkflowLike = {
  jobs?: Record<string, WorkflowJobLike>
}

// The canonical set of workflow_run-triggered files named in #9150/#10167. A new file must add its
// parsed workflow fixture here so every event-derived job is classified.
export const SOURCE_RUN_WORKFLOWS: Record<string, WorkflowLike> = {
  'dispatch-completed-deploy.yml': load(
    readFileSync('.github/workflows/dispatch-completed-deploy.yml', 'utf8'),
  ) as WorkflowLike,
  'fix-main.yml': parsedMain,
  'fix-main-self-retry.yml': load(
    readFileSync('.github/workflows/fix-main-self-retry.yml', 'utf8'),
  ) as WorkflowLike,
  'fix-dependabot.yml': parsedDependabot,
}

export type SourceRunSite = {
  workflow: string
  job: string
}

const WORKFLOW_RUN_EVENT_MARKER = 'github.event.workflow_run.'
const SOURCE_RUN_INPUT_PREFIX = 'source-run-'

function referencesWorkflowRunEvent(job: WorkflowJobLike): boolean {
  const haystack = [
    job.if,
    job.env && JSON.stringify(job.env),
    job.with && JSON.stringify(job.with),
    ...(job.steps ?? []).flatMap(step => [
      step.if,
      step.run,
      step.with && JSON.stringify(step.with),
      step.env && JSON.stringify(step.env),
    ]),
  ].join('\n')
  return haystack.includes(WORKFLOW_RUN_EVENT_MARKER)
}

function callsReusableWorkflowWithSourceRun(job: WorkflowJobLike): boolean {
  if (!job.uses || !job.with) return false
  return Object.keys(job.with).some(key => key.startsWith(SOURCE_RUN_INPUT_PREFIX))
}

/**
 * A site is any job in a `SOURCE_RUN_WORKFLOWS`-registered workflow that reads
 * `github.event.workflow_run.*` directly, or that forwards `source-run-*` to a reusable-workflow
 * call without a literal event reference (e.g. sourced from an upstream job's outputs).
 * Trigger-derived, not guard-derived, so an added job that touches workflow_run state is a site
 * even before anyone gives it a guard — but only within the registered set; a matching job in an
 * unregistered workflow (e.g. Scheduled Prompts forwarding its self-derived `source-run-id`) isn't
 * scanned until its workflow is added above.
 */
export function listSourceRunSites(
  workflows: Record<string, WorkflowLike> = SOURCE_RUN_WORKFLOWS,
): SourceRunSite[] {
  const sites: SourceRunSite[] = []
  for (const [workflow, parsed] of Object.entries(workflows)) {
    for (const [job, jobDefinition] of Object.entries(parsed.jobs ?? {})) {
      if (
        referencesWorkflowRunEvent(jobDefinition) ||
        callsReusableWorkflowWithSourceRun(jobDefinition)
      ) {
        sites.push({ workflow, job })
      }
    }
  }
  return sites
}

export type SourceRunExemption = {
  workflow: string
  job: string
  reason: string
}

export const SOURCE_RUN_EXEMPTIONS: SourceRunExemption[] = [
  {
    workflow: 'dispatch-completed-deploy.yml',
    job: 'dispatch',
    reason:
      'Every trusted successful default-branch source completion is an intended immutable deployment request, not stale automation to suppress; vouchington-infra independently validates the exact run attempt and owns deployment sequencing.',
  },
  {
    workflow: 'fix-main.yml',
    job: 'related-candidates',
    reason:
      'Read-only related-PR/issue lookup keyed by workflow name. Performs no mutation; every downstream job that acts on its output is independently guarded before mutating.',
  },
  {
    workflow: 'fix-main-self-retry.yml',
    job: 'escalate-retry-failure',
    reason:
      "Mutates only a human-facing GitHub issue, never the source (Fix Main) run, and fires precisely when the retry job could not confirm a handled outcome — including when that job's own guard failed or was stale. Gating this job on a fresh revalidation would reintroduce the exact silent-suppression failure mode it exists to catch.",
  },
]
