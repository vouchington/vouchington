import type { CiTopologyImpactDiagnostic, CiTopologyImpactReport } from 'no-mistakes'

import {
  CI_WORKFLOW_PATH,
  type CiTopologyImpactRoutingOptions,
} from './workflow-topology-impact-contract.mts'

const WORKFLOW_PATH = /^\.github\/workflows\/.+\.ya?ml$/u
const ACTION_PATH = /^\.github\/actions\//u

export function isTopologyPath(path: string): boolean {
  return WORKFLOW_PATH.test(path) || ACTION_PATH.test(path)
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return (
    values.length > 0 &&
    values.every(value => value.length > 0) &&
    new Set(values).size === values.length
  )
}

function isDiagnostic(
  value: unknown,
  knownRootJobIds: ReadonlySet<string>,
): value is CiTopologyImpactDiagnostic {
  if (typeof value !== 'object' || value === null) return false
  const diagnostic = value as Partial<CiTopologyImpactDiagnostic>
  if (typeof diagnostic.code !== 'string' || diagnostic.code.length === 0) return false
  if (typeof diagnostic.message !== 'string' || diagnostic.message.length === 0) return false
  if (diagnostic.scope === 'global') return diagnostic.rootJobIds === undefined
  return (
    diagnostic.scope === 'localized' &&
    diagnostic.rootJobIds !== undefined &&
    uniqueNonEmpty(diagnostic.rootJobIds) &&
    diagnostic.rootJobIds.every(root => knownRootJobIds.has(root))
  )
}

function isReport(
  value: unknown,
  knownRootJobIds: ReadonlySet<string>,
): value is CiTopologyImpactReport {
  if (typeof value !== 'object' || value === null) return false
  const report = value as Partial<CiTopologyImpactReport>
  return (
    report.schemaVersion === 1 &&
    typeof report.baseRevision === 'string' &&
    report.baseRevision.length > 0 &&
    typeof report.headRevision === 'string' &&
    report.headRevision.length > 0 &&
    Array.isArray(report.changedPaths) &&
    report.changedPaths.every(path => typeof path === 'string') &&
    Array.isArray(report.affectedWorkflows) &&
    report.affectedWorkflows.every(path => typeof path === 'string') &&
    Array.isArray(report.affectedRootJobIds) &&
    report.affectedRootJobIds.every(root => typeof root === 'string') &&
    Array.isArray(report.diagnostics) &&
    report.diagnostics.every(diagnostic => isDiagnostic(diagnostic, knownRootJobIds)) &&
    typeof report.globalFallback === 'boolean'
  )
}

function samePathSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === new Set(left).size &&
    right.length === new Set(right).size &&
    left.length === right.length &&
    left.every(path => right.includes(path))
  )
}

export function validateTopologyResult(
  impact: unknown,
  options: CiTopologyImpactRoutingOptions,
): { ok: true; report: CiTopologyImpactReport } | { ok: false; reason: string } {
  if (!isReport(impact, options.knownRootJobIds))
    return { ok: false, reason: 'invalid topology impact result' }
  if (impact.baseRevision !== options.input.base || impact.headRevision !== options.input.head) {
    return { ok: false, reason: 'topology impact revision mismatch' }
  }
  if (!samePathSet(impact.changedPaths, options.changedPaths)) {
    return { ok: false, reason: 'topology impact changed-path mismatch' }
  }
  if (
    (impact.affectedWorkflows.length > 0 && !uniqueNonEmpty(impact.affectedWorkflows)) ||
    (impact.affectedRootJobIds.length > 0 && !uniqueNonEmpty(impact.affectedRootJobIds))
  ) {
    return { ok: false, reason: 'topology impact contains duplicate or empty entries' }
  }
  if (impact.affectedRootJobIds.some(root => !options.knownRootJobIds.has(root))) {
    return { ok: false, reason: 'topology impact contains unknown root job' }
  }
  const changedWorkflow = options.changedPaths.filter(path => WORKFLOW_PATH.test(path))
  if (
    changedWorkflow.some(
      path => path !== CI_WORKFLOW_PATH && !impact.affectedWorkflows.includes(path),
    )
  ) {
    return { ok: false, reason: 'unrecognized deleted workflow descriptor' }
  }
  if (
    !impact.globalFallback &&
    impact.diagnostics.some(diagnostic => diagnostic.scope === 'global')
  ) {
    return { ok: false, reason: 'inconsistent global topology diagnostic' }
  }
  return { ok: true, report: impact }
}

export function topologyResultFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `topology impact provider failed: ${message}`
}
