import type { RerunTarget } from '../../ci/transient-retry/types.mts'
import type { WorkflowTopologyIndex } from 'no-mistakes'
import type {
  TargetedRerunPolicy,
  TargetedRule,
  WorkflowTopologyPolicy,
} from './workflow-topology-policy-types.mts'

// Identity check is family-aware: an exact-name rule must match an exact-name row and a
// family rule must match a family row. A shape mismatch (rule is exact, row is family, or
// vice versa) is reported the same as a name mismatch — never silently ignored.
function rerunTargetIdentityDiagnostics(
  ruleId: string,
  rerunTarget: RerunTarget,
  row: TargetedRerunPolicy,
): string[] {
  if (rerunTarget.jobName !== undefined) {
    if (row.rerunTargetJobName === undefined) {
      return [
        `targeted rerun shape mismatch: rule ${ruleId} declares exact jobName "${rerunTarget.jobName}", but policy row declares jobNameFamily "${row.rerunTargetJobNameFamily}"`,
      ]
    }
    if (rerunTarget.jobName === row.rerunTargetJobName) return []
    return [
      `targeted rerun job name mismatch: ${ruleId}: expected ${row.rerunTargetJobName}, got ${rerunTarget.jobName}`,
    ]
  }
  if (row.rerunTargetJobNameFamily === undefined) {
    return [
      `targeted rerun shape mismatch: rule ${ruleId} declares jobNameFamily "${rerunTarget.jobNameFamily}", but policy row declares exact jobName "${row.rerunTargetJobName}"`,
    ]
  }
  if (rerunTarget.jobNameFamily === row.rerunTargetJobNameFamily) return []
  return [
    `targeted rerun job name family mismatch: ${ruleId}: expected ${row.rerunTargetJobNameFamily}, got ${rerunTarget.jobNameFamily}`,
  ]
}

export function targetedRerunDiagnostics(
  index: WorkflowTopologyIndex,
  policy: WorkflowTopologyPolicy,
  rules: readonly TargetedRule[],
): string[] {
  const targetedRules = new Map(
    rules.flatMap(rule => (rule.rerunTarget ? [[rule.id, rule.rerunTarget] as const] : [])),
  )
  const actualIds = [...targetedRules.keys()].toSorted()
  const expectedIds = Object.keys(policy.targetedReruns).toSorted()
  const diagnostics: string[] = []
  for (const id of actualIds)
    if (!policy.targetedReruns[id]) diagnostics.push(`targeted rerun policy missing: ${id}`)
  for (const id of expectedIds)
    if (!actualIds.includes(id)) diagnostics.push(`targeted rerun policy stale: ${id}`)
  for (const [ruleId, row] of Object.entries(policy.targetedReruns)) {
    const rerunTarget = targetedRules.get(ruleId)
    if (rerunTarget) diagnostics.push(...rerunTargetIdentityDiagnostics(ruleId, rerunTarget, row))
    const target = index.jobsById.get(row.innerTargetJob)
    if (!target) {
      diagnostics.push(`targeted rerun target missing: ${ruleId}: ${row.innerTargetJob}`)
      continue
    }
    diagnostics.push(
      ...closureDiagnostics(
        index,
        ruleId,
        'inner',
        row.innerTargetJob,
        index.transitiveDownstreamJobIds(row.innerTargetJob),
        row.innerDownstreamJobs,
      ),
    )
    const actualCallers = index.directCallerJobIds(target.workflowId)
    const declaredCallers = Object.keys(row.outerCallers).toSorted()
    for (const caller of actualCallers)
      if (!declaredCallers.includes(caller))
        diagnostics.push(`targeted rerun outer caller policy missing: ${ruleId}: ${caller}`)
    for (const caller of declaredCallers)
      if (!actualCallers.includes(caller))
        diagnostics.push(`targeted rerun outer caller policy stale: ${ruleId}: ${caller}`)
    for (const [caller, consumers] of Object.entries(row.outerCallers)) {
      if (!index.jobsById.has(caller)) {
        diagnostics.push(`targeted rerun outer caller missing: ${ruleId}: ${caller}`)
        continue
      }
      if (!actualCallers.includes(caller)) {
        diagnostics.push(
          `targeted rerun outer caller mismatch: ${ruleId}: ${caller} -> ${target.workflowId}`,
        )
        continue
      }
      diagnostics.push(
        ...closureDiagnostics(
          index,
          ruleId,
          'outer',
          caller,
          index.transitiveDownstreamJobIds(caller),
          consumers,
        ),
      )
    }
  }
  return diagnostics
}

function closureDiagnostics(
  index: WorkflowTopologyIndex,
  ruleId: string,
  layer: 'inner' | 'outer',
  target: string,
  actual: readonly string[],
  expected: readonly string[],
): string[] {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const diagnostics: string[] = []
  for (const consumer of actual)
    if (!expectedSet.has(consumer))
      diagnostics.push(
        `targeted rerun ${layer} downstream policy missing: ${ruleId}: ${target} -> ${consumer}`,
      )
  for (const consumer of expected) {
    if (!index.jobsById.has(consumer))
      diagnostics.push(`targeted rerun ${layer} consumer missing: ${ruleId}: ${consumer}`)
    else if (!actualSet.has(consumer))
      diagnostics.push(
        `targeted rerun ${layer} downstream policy stale: ${ruleId}: ${target} -> ${consumer}`,
      )
  }
  return diagnostics
}
