import { parse as load } from 'yaml'

const BUILD_WEB_TARGETS = './.github/actions/build-web-targets'
const POST_DEADLINE_MARGIN_SECONDS = 60
const RESTORE_LOOKUP_EXTRACT_ALLOWANCE_SECONDS = 60
const KILL_GRACE_SECONDS = 13
const ACTION_PATH = '.github/actions/build-web-targets/action.yml'

type Step = { uses?: string; with?: Record<string, unknown>; 'timeout-minutes'?: unknown }
type Workflow = { jobs?: Record<string, { 'runs-on'?: unknown; steps?: Step[] }> }
export type Deadlines = { restore: number; verify: number; build: number; killGrace: number }
export type BuildWebTargetsUse = { job: string; runsOn: unknown; mode: unknown }
export type CallerTimeout = { job: string; timeoutMinutes: unknown }

export function buildWebTargetsUses(workflows: Record<string, Workflow>): BuildWebTargetsUse[] {
  return Object.entries(workflows).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? []).flatMap(step =>
        step.uses === BUILD_WEB_TARGETS
          ? [
              {
                job: `${file}#${jobName}`,
                runsOn: job['runs-on'],
                mode: step.with?.['shared-build-cache-mode'],
              },
            ]
          : [],
      ),
    ),
  )
}
function literalLabel(runsOn: unknown): string | undefined {
  return typeof runsOn === 'string' && !runsOn.includes('${{') ? runsOn : undefined
}
export function runnerParityViolations(uses: readonly BuildWebTargetsUse[]): string[] {
  const violations = uses.flatMap(use =>
    literalLabel(use.runsOn) === undefined
      ? [`${use.job}: runs-on must be one literal label, got ${JSON.stringify(use.runsOn)}`]
      : [],
  )
  const jobsByLabel = new Map<string, string[]>()
  for (const use of uses) {
    const label = literalLabel(use.runsOn)
    if (label === undefined) continue
    jobsByLabel.set(label, [...(jobsByLabel.get(label) ?? []), use.job])
  }
  if (jobsByLabel.size > 1) {
    const groups = [...jobsByLabel].map(([label, jobs]) => `${label}: ${jobs.join(', ')}`)
    violations.push(`build-web-targets jobs span more than one runner label (${groups.join('; ')})`)
  }
  return violations
}
export function boundedSeconds(action: string, command: string): number {
  const match = new RegExp(`run-bounded\\.py" ([1-9]\\d*) ${command}`).exec(action)
  if (!match) throw new TypeError(`build-web-targets must run ${command} under run-bounded.py`)
  return Number(match[1])
}
export function restoreSeconds(action: string): number {
  const match = /SEGMENT_DOWNLOAD_TIMEOUT_MINS: '([1-9]\d*)'/.exec(action)
  if (!match) throw new TypeError('build-web-targets must bound its cache restore download')
  return Number(match[1]) * 60 + RESTORE_LOOKUP_EXTRACT_ALLOWANCE_SECONDS
}
export function readDeadlines(action: string): Deadlines {
  return {
    restore: restoreSeconds(action),
    verify: boundedSeconds(action, 'node ci/web-build-cache-manifest\\.mts verify'),
    build: boundedSeconds(action, 'node ci/setup-web-integration\\.mts'),
    killGrace: KILL_GRACE_SECONDS,
  }
}
export function expectedMinutes(deadlines: Deadlines): number {
  const total =
    deadlines.restore +
    deadlines.verify +
    deadlines.build +
    2 * deadlines.killGrace +
    POST_DEADLINE_MARGIN_SECONDS
  return Math.ceil(total / 60)
}
export function timeoutViolations(
  callers: readonly CallerTimeout[],
  deadlines: Deadlines,
): string[] {
  const expected = expectedMinutes(deadlines)
  return callers.flatMap(caller =>
    caller.timeoutMinutes === expected
      ? []
      : [
          `${caller.job}: timeout-minutes is ${JSON.stringify(caller.timeoutMinutes)}, expected ${expected} ` +
            `(restore, verify, build and kill grace deadlines plus ${POST_DEADLINE_MARGIN_SECONDS}s)`,
        ],
  )
}
export function buildWebTargetsContractViolations(sources: ReadonlyMap<string, string>): string[] {
  const workflows = Object.fromEntries(
    [...sources].flatMap(([path, source]) =>
      path.startsWith('.github/workflows/')
        ? [[path.slice('.github/workflows/'.length), load(source) as Workflow]]
        : [],
    ),
  ) as Record<string, Workflow>
  const uses = buildWebTargetsUses(workflows)
  const violations: string[] = []
  const modes = new Set(uses.map(use => use.mode))
  if (modes.size !== 2 || !modes.has('producer') || !modes.has('consumer'))
    violations.push('build-web-targets must have producer and consumer callers')
  violations.push(...runnerParityViolations(uses))
  const callers = Object.entries(workflows).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? []).flatMap(step =>
        step.uses === BUILD_WEB_TARGETS
          ? [{ job: `${file}#${jobName}`, timeoutMinutes: step['timeout-minutes'] }]
          : [],
      ),
    ),
  )
  if (!callers.some(caller => caller.job === 'checks-static.yml#static-web'))
    violations.push('checks-static.yml#static-web must call build-web-targets')
  const action = sources.get(ACTION_PATH)
  if (action === undefined) throw new Error(`Missing ${ACTION_PATH}`)
  violations.push(...timeoutViolations(callers, readDeadlines(action)))
  return violations
}
