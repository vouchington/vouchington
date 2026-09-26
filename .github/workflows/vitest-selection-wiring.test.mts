import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { assertWorkflowInvariant } from '../test-helpers/workflow-test-helpers.mts'

type Step = {
  name?: string
  if?: string
  env?: Record<string, string>
  run?: string
  uses?: string
  with?: Record<string, string>
}
type Job = {
  if?: string
  with?: Record<string, string | boolean>
  services?: Record<string, { env?: Record<string, string> }>
  steps?: Step[]
}
type Workflow = {
  on?: {
    workflow_call?: { inputs?: Record<string, { type?: string; default?: boolean }> }
    workflow_dispatch?: { inputs?: Record<string, { type?: string; default?: boolean }> }
  }
  jobs?: Record<string, Job>
}

const shardedWorkflows = new Set([
  'tests-backend-unit.yml',
  'tests-web.yml',
  'tests-web-api.yml',
  'tests-web-integration.yml',
])
const sideDutyWorkflows = [
  'tests-backend-modules.yml',
  'tests-postgres-schema.yml',
  'tests-cloudflare-worker.yml',
  'tests-lambdas.yml',
]

describe('targeted Vitest workflow input wiring', () => {
  it('passes every non-sharded selected_test_files input to its test step, never a service', () => {
    const workflowDir = '.github/workflows'
    const workflows = readdirSync(workflowDir)
      .filter(file => file.endsWith('.yml') && !shardedWorkflows.has(file))
      .map(file => ({
        file,
        workflow: load(readFileSync(join(workflowDir, file), 'utf8')) as Workflow,
      }))
      .filter(({ workflow }) => workflow.on?.workflow_call?.inputs?.selected_test_files)

    expect(workflows.length).toBeGreaterThan(0)

    for (const { file, workflow } of workflows) {
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [serviceName, service] of Object.entries(job.services ?? {})) {
          assertWorkflowInvariant(
            !Object.hasOwn(service.env ?? {}, 'VITEST_SELECTED_FILES'),
            `${file}:${jobName} service ${serviceName} must not receive test selection`,
          )
        }
      }

      const testSteps = Object.values(workflow.jobs ?? {}).flatMap(job =>
        (job.steps ?? []).filter(
          step =>
            /vitest|storybook-browser-tests|tooling-test-runner|test:portability/.test(
              step.run ?? '',
            ) && step.env?.VITEST_SELECTED_FILES?.includes('inputs.selected_test_files'),
        ),
      )
      assertWorkflowInvariant(
        testSteps.length > 0,
        `${file} must wire selected files into a test step`,
      )
    }
  })

  it.each(sideDutyWorkflows)(
    '%s skips only Vitest and its reports when selection is empty',
    file => {
      const workflow = load(readFileSync(join('.github/workflows', file), 'utf8')) as Workflow
      for (const trigger of [workflow.on?.workflow_call, workflow.on?.workflow_dispatch]) {
        expect(trigger?.inputs?.run_tests).toMatchObject({ type: 'boolean', default: true })
      }

      const steps = Object.values(workflow.jobs ?? {}).flatMap(job => job.steps ?? [])
      const vitestSteps = steps.filter(step => /\bvitest run\b/.test(step.run ?? ''))
      expect(vitestSteps.length).toBeGreaterThan(0)
      for (const step of vitestSteps) expect(step.if).toContain('inputs.run_tests')

      const reportSteps = steps.filter(
        step =>
          /Upload (?:coverage|vitest-blob)/.test(step.name ?? '') ||
          /^(?:coverage|vitest-blob)-/.test(step.with?.name ?? '') ||
          /^\.\/\.github\/actions\/upload-(?:coverage-pair|vitest-blob)$/.test(step.uses ?? ''),
      )
      expect(reportSteps.length).toBeGreaterThan(0)
      for (const step of reportSteps) expect(step.if).toContain('inputs.run_tests')
    },
  )

  function ciCallerJob(jobName: string) {
    const ci = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow
    return ci.jobs?.[jobName]
  }

  it.each([['test-postgres-schema', 'run-tests-test-postgres-schema']])(
    'retains %s for side duties while passing its test decision',
    (jobName, outputName) => {
      const job = ciCallerJob(jobName)
      expect(job?.if).not.toContain(`skip-${jobName}`)
      expect(job?.with?.run_tests).toBe(`\${{ needs.select-ci.outputs.${outputName} != 'false' }}`)
    },
  )

  it.each([
    ['test-backend-modules', 'run-tests-test-backend-modules'],
    ['test-cloudflare-worker', 'run-tests-test-cloudflare-worker'],
    ['test-lambdas', 'run-tests-test-lambdas'],
  ])(
    'skips %s entirely when it has no side duties and its test selection is empty',
    (jobName, outputName) => {
      const job = ciCallerJob(jobName)
      expect(job?.if).toContain(`needs.select-ci.outputs.skip-${jobName} != 'true'`)
      expect(job?.with?.run_tests).toBe(`\${{ needs.select-ci.outputs.${outputName} != 'false' }}`)
    },
  )

  it.each([
    ['test-backend-unit', 'skip-test-backend-unit'],
    ['test-web', 'skip-test-web'],
    ['test-web-api', 'skip-test-web-api'],
    ['test-web-integration', 'skip-test-web-integration'],
  ])('%s skips when its selection is empty', (jobName, skipOutput) => {
    expect(ciCallerJob(jobName)?.if).toContain(`needs.select-ci.outputs.${skipOutput} != 'true'`)
  })
})
