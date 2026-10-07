import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  assertNoWorkflowViolations,
  type WorkflowStep,
} from '../test-helpers/workflow-fixtures.mts'

// Each caller bounds the build-web-targets composite step, and the composite bounds its build
// command with run-bounded.py. The inner deadline must fire first and leave room for the
// composite's always() timing summary and upload, or a hung build leaves no timing evidence. The
// step ceiling is that deadline plus the margin, rounded up to a whole minute, so raising one
// without the other fails here.
const BUILD_WEB_TARGETS = './.github/actions/build-web-targets'
const POST_DEADLINE_MARGIN_SECONDS = 60

type Workflow = {
  jobs?: Record<string, { steps?: (WorkflowStep & { 'timeout-minutes'?: unknown })[] }>
}

type CallerTimeout = { job: string; timeoutMinutes: unknown }

function callerTimeouts(workflows: Record<string, Workflow>): CallerTimeout[] {
  return Object.entries(workflows).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? [])
        .filter(step => step.uses === BUILD_WEB_TARGETS)
        .map(step => ({ job: `${file}#${jobName}`, timeoutMinutes: step['timeout-minutes'] })),
    ),
  )
}

function buildDeadlineSeconds(action: string): number {
  const match = /run-bounded\.py" ([1-9]\d*) node ci\/setup-web-integration\.mts/.exec(action)
  if (!match) throw new TypeError('build-web-targets must run its build under run-bounded.py')
  return Number(match[1])
}

function timeoutViolations(callers: readonly CallerTimeout[], deadlineSeconds: number): string[] {
  const expected = Math.ceil((deadlineSeconds + POST_DEADLINE_MARGIN_SECONDS) / 60)
  return callers
    .filter(caller => caller.timeoutMinutes !== expected)
    .map(
      caller =>
        `${caller.job}: timeout-minutes is ${JSON.stringify(caller.timeoutMinutes)}, expected ${expected} ` +
        `(the ${deadlineSeconds}s build deadline plus ${POST_DEADLINE_MARGIN_SECONDS}s)`,
    )
}

function readWorkflows(): Record<string, Workflow> {
  const files = readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file))
  return Object.fromEntries(
    files.map(file => [file, load(readFileSync(join('.github/workflows', file), 'utf8'))]),
  ) as Record<string, Workflow>
}

describe('build-web-targets timeouts', () => {
  it('sizes every caller step ceiling from the composite build deadline', () => {
    const callers = callerTimeouts(readWorkflows())
    const deadline = buildDeadlineSeconds(
      readFileSync('.github/actions/build-web-targets/action.yml', 'utf8'),
    )

    // Guard against a vacuous pass: the static-web producer must be discovered.
    expect(callers.map(caller => caller.job)).toContain('checks-static.yml#static-web')
    assertNoWorkflowViolations(
      timeoutViolations(callers, deadline),
      'build-web-targets timeout violations',
    )
  })

  it('reports callers whose step ceiling is missing or does not match the deadline', () => {
    const violations = timeoutViolations(
      [
        { job: 'a.yml#build', timeoutMinutes: 6 },
        { job: 'b.yml#test', timeoutMinutes: 5 },
        { job: 'c.yml#test', timeoutMinutes: 13 },
        { job: 'd.yml#test', timeoutMinutes: undefined },
      ],
      300,
    )

    expect(violations).toEqual([
      'b.yml#test: timeout-minutes is 5, expected 6 (the 300s build deadline plus 60s)',
      'c.yml#test: timeout-minutes is 13, expected 6 (the 300s build deadline plus 60s)',
      'd.yml#test: timeout-minutes is undefined, expected 6 (the 300s build deadline plus 60s)',
    ])
  })

  it('rejects a composite that does not bound its build command', () => {
    expect(() => buildDeadlineSeconds('node ci/setup-web-integration.mts')).toThrow(
      'build-web-targets must run its build under run-bounded.py',
    )
  })
})
