import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type WorkflowJob = {
  if?: string
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
  permissions?: Record<string, string>
  env?: Record<string, string>
  'continue-on-error'?: boolean
  steps?: Array<{
    env?: Record<string, string>
    run?: string
    uses?: string
    with?: Record<string, unknown>
  }>
}

type Workflow = {
  on?: Record<string, unknown>
  jobs?: Record<string, WorkflowJob>
}

const PRODUCER_FAN_INS = {
  '.github/workflows/main-checks.yml': ['tooling-tests', 'ts-shared-tests', 'explain-analyze'],
  '.github/workflows/main-web.yml': [
    'test-web',
    'test-web-api',
    'test-web-integration',
    'store-playwright-otel',
    'playwright-credentialed-tests',
  ],
} as const

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('attempt-scoped artifact cleanup fan-ins', () => {
  it.each(Object.entries(PRODUCER_FAN_INS))(
    'wires $0 to reusable cleanup after its terminal jobs',
    (path, expectedNeeds) => {
      const source = readFileSync(path, 'utf8')
      const workflow = load(source) as Workflow
      const cleanup = workflow.jobs?.['cleanup-artifacts']

      expect(cleanup).toBeDefined()
      expect(cleanup?.uses).toBe('./.github/workflows/cleanup-artifacts.yml')
      expect(cleanup?.needs).toEqual(expectedNeeds)
      expect(cleanup?.if).toBe('${{ always() && !cancelled() && !failure() }}')
      expect(cleanup?.permissions).toEqual({ actions: 'write', contents: 'read' })
      expect(cleanup?.with).toEqual({ run_id: '${{ github.run_id }}' })
    },
  )

  it.each(Object.keys(PRODUCER_FAN_INS))(
    'triggers $0 when the reusable cleanup implementation changes',
    path => {
      const source = readFileSync(path, 'utf8')
      for (const dependency of [
        '.github/workflows/cleanup-artifacts.yml',
        'ci/cleanup-artifacts-pattern-matcher.mjs',
        'ci/cleanup-artifacts-patterns.json',
        'ci/cleanup-run-artifacts.mjs',
      ]) {
        expect(source).toContain(`- '${dependency}'`)
      }
    },
  )

  it('keeps pull-request CI outside the writable immediate cleanup path', () => {
    const workflow = readWorkflow('.github/workflows/ci.yml')

    expect(workflow.jobs).not.toHaveProperty('cleanup-artifacts')
  })

  it('keeps immediate cleanup callable in-run and the stale sweep standalone', () => {
    const source = readFileSync('.github/workflows/cleanup-artifacts.yml', 'utf8')
    const workflow = readWorkflow('.github/workflows/cleanup-artifacts.yml')
    const workflowCall = workflow.on?.workflow_call as
      | { inputs?: Record<string, Record<string, unknown>> }
      | undefined
    const cleanupRun = workflow.jobs?.['cleanup-run']
    const cleanupSweep = workflow.jobs?.['cleanup-sweep']

    expect(workflow.on).not.toHaveProperty('workflow_run')
    expect(source).not.toContain('github.event.workflow_run')
    expect(workflowCall?.inputs?.run_id).toEqual({
      description: 'Run whose terminal producer fan-in is invoking cleanup',
      required: true,
      type: 'string',
    })
    expect(cleanupRun?.if).toBe("inputs.run_id != ''")
    expect(cleanupRun?.['continue-on-error']).toBe(true)
    expect(cleanupRun?.env).toBeUndefined()
    expect(cleanupRun?.permissions).toEqual({ actions: 'write', contents: 'read' })
    expect(cleanupRun?.steps?.some(step => step.uses === './.github/actions/setup-node-pnpm')).toBe(
      false,
    )
    expect(cleanupRun?.steps?.some(step => step.run?.includes('cleanup-artifacts.mts run'))).toBe(
      false,
    )
    const cleanupStep = cleanupRun?.steps?.find(step =>
      step.uses?.startsWith('actions/github-script@'),
    )
    expect(cleanupStep?.env).toEqual({ WORKFLOW_RUN_ID: '${{ inputs.run_id }}' })
    expect(cleanupStep?.with?.retries).toBe(4)
    expect(cleanupStep?.with?.['retry-exempt-status-codes']).toBe('400,401,404,422')
    expect(cleanupStep?.with?.script).toContain('cleanup-run-artifacts.mjs')
    expect(cleanupStep?.with?.script).not.toContain('${{ inputs.run_id }}')
    const checkout = cleanupRun?.steps?.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout?.with?.['sparse-checkout']).toBeUndefined()
    expect(checkout?.with?.['sparse-checkout-cone-mode']).toBeUndefined()
    expect(cleanupSweep?.if).toBe(
      "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
    )
  })
})
