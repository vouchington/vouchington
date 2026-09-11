import {
  SOURCE_RUN_EXEMPTIONS,
  SOURCE_RUN_WORKFLOWS,
  listSourceRunSites,
  type SourceRunExemption,
  type SourceRunSite,
  type WorkflowJobLike,
  type WorkflowLike,
} from './source-run-guard-inventory.mts'
import { SOURCE_RUN_GUARD_SHELL } from './source-run-guard-shell.mts'

export type SourceRunSiteDisposition = 'guarded' | 'gated' | 'exempt' | 'unguarded'

const CHECKED_OUT_GUARD_RUN = 'node ci/source-run-state.mts'
const GATE_CONDITION =
  /needs\.([a-z_][a-z0-9_-]*)\.outputs\.(?:current|source-current)\s*==\s*'true'/gi

function hasOwnGuardStep(job: WorkflowJobLike): boolean {
  return (job.steps ?? []).some(step => {
    if (step.id !== 'source-state' || step.if !== undefined) return false
    const run = step.run?.trim()
    return run === SOURCE_RUN_GUARD_SHELL.trim() || run === CHECKED_OUT_GUARD_RUN
  })
}

/**
 * One-hop only: a job that gates on an upstream that is itself only gated (not guarded) is not
 * recognized here, so every dependency chain must terminate in a job with its own guard step.
 */
function gatesOnGuardedUpstream(
  workflows: Record<string, WorkflowLike>,
  workflow: string,
  job: WorkflowJobLike,
): boolean {
  if (!job.if) return false
  for (const match of job.if.matchAll(GATE_CONDITION)) {
    const upstreamJob = workflows[workflow]?.jobs?.[match[1] as string]
    if (upstreamJob && hasOwnGuardStep(upstreamJob)) return true
  }
  return false
}

export function classifySourceRunSite(
  workflows: Record<string, WorkflowLike>,
  exemptions: SourceRunExemption[],
  site: SourceRunSite,
): SourceRunSiteDisposition {
  const job = workflows[site.workflow]?.jobs?.[site.job]
  if (job && hasOwnGuardStep(job)) return 'guarded'
  if (job && gatesOnGuardedUpstream(workflows, site.workflow, job)) return 'gated'
  if (
    exemptions.some(exemption => exemption.workflow === site.workflow && exemption.job === site.job)
  ) {
    return 'exempt'
  }
  return 'unguarded'
}

export type SourceRunGuardTotalityResult = {
  unguardedSites: SourceRunSite[]
  orphanedExemptions: SourceRunExemption[]
}

/**
 * Bidirectional: {@link SourceRunGuardTotalityResult.unguardedSites} catches a new
 * workflow_run-derived job added without a guard, gate, or exemption; {@link
 * SourceRunGuardTotalityResult.orphanedExemptions} catches a declared exemption whose job was
 * renamed or removed and so no longer matches any real site.
 */
export function checkSourceRunGuardTotality(
  workflows: Record<string, WorkflowLike> = SOURCE_RUN_WORKFLOWS,
  exemptions: SourceRunExemption[] = SOURCE_RUN_EXEMPTIONS,
): SourceRunGuardTotalityResult {
  const sites = listSourceRunSites(workflows)
  const unguardedSites = sites.filter(
    site => classifySourceRunSite(workflows, exemptions, site) === 'unguarded',
  )
  const orphanedExemptions = exemptions.filter(
    exemption =>
      !sites.some(site => site.workflow === exemption.workflow && site.job === exemption.job),
  )
  return { unguardedSites, orphanedExemptions }
}
