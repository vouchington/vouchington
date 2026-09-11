// CI's fan-in jobs fail whenever any leaf job fails, so rules that require "no other
// failed jobs" must let them through. Shared by every consumer (rules.mts,
// every retry rule) so the allowlist cannot drift between consumers.
export const CI_PATCH_COVERAGE_JOB_NAMES: ReadonlySet<string> = new Set([
  'Patch Coverage',
  'Patch Coverage / Patch Coverage',
])

export const CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES: ReadonlySet<string> = new Set([
  'tests-processing',
  'tests-processing / tests-processing',
  'tests',
  'build',
])

export const CI_AGGREGATE_FAN_IN_JOB_NAMES: ReadonlySet<string> = new Set([
  ...CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES,
  ...CI_PATCH_COVERAGE_JOB_NAMES,
])

// A fan-in job's own log rarely carries a leaf-specific failure signature — it fails because a
// leaf it depends on failed or was cancelled, and its log says so. Rules that require "every
// failed job shows the same leaf signature" must recognize this cascade summary and exclude the
// fan-in job from that check, rather than requiring its log to carry the leaf signature too.
export function isAggregateFanInCascade(name: string, log: string): boolean {
  if (CI_PATCH_COVERAGE_JOB_NAMES.has(name)) {
    return (
      log.includes('One or more Vitest producer jobs failed or were cancelled.') ||
      log.includes('One or more coverage jobs failed or were cancelled')
    )
  }
  if (name === 'tests-processing' || name === 'tests-processing / tests-processing') {
    return [
      'One or more required jobs failed or were cancelled',
      'Dependency-free required job results were missing, malformed, or unsuccessful',
    ].some(message => log.includes(message))
  }
  if (name === 'tests')
    return [
      'One or more required jobs failed or were cancelled',
      'One or more required jobs were missing, malformed, or unsuccessful',
    ].some(message => log.includes(message))
  if (name === 'build')
    return [
      'One or more build jobs failed or were cancelled',
      'One or more build jobs were missing, malformed, or unsuccessful',
    ].some(message => log.includes(message))
  return false
}
