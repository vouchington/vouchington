import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { runsPnpmInstall, stepLists } from './pnpm-policy.test-helpers.mts'

type Step = {
  env?: Record<string, unknown>
  run?: string
  uses?: string
  with?: Record<string, unknown>
}
type Job = {
  env?: Record<string, unknown>
  'runs-on'?: string | string[]
  steps?: Step[]
}
type Workflow = { jobs?: Record<string, Job> }
type SetupCall = {
  file: string
  jobId: string
  job: Job
  step: Step
  stepIndex: number
}

const workflowFiles = readdirSync('.github/workflows')
  .filter(file => file.endsWith('.yml'))
  .toSorted()

function readWorkflow(file: string): Workflow {
  return load(readFileSync(join('.github/workflows', file), 'utf8')) as Workflow
}

const workflows = new Map(workflowFiles.map(file => [file, readWorkflow(file)]))
const setupCalls: SetupCall[] = [...workflows].flatMap(([file, workflow]) =>
  Object.entries(workflow.jobs ?? {}).flatMap(([jobId, job]) =>
    (job.steps ?? []).flatMap((step, stepIndex) =>
      step.uses === './.github/actions/setup-node-pnpm' ||
      step.uses === './.github/actions/setup-backend'
        ? [{ file, jobId, job, step, stepIndex }]
        : [],
    ),
  ),
)

const scriptFreeInstallCallers = new Set([
  'fix-main-self-retry.yml#retry',
  'fix-main.yml#classify-self-failure',
  'fix-main.yml#related-candidates',
  'fix-main.yml#render-prompt',
  'fix-main.yml#triage-and-rerun',
])

function callerId(call: SetupCall) {
  return `${call.file}#${call.jobId}`
}

function hasExplicitCredential(step: Step) {
  const serialized = JSON.stringify({ env: step.env, with: step.with })
  return (
    serialized.includes('secrets.') ||
    step.uses === './.github/actions/setup-aws' ||
    step.uses?.startsWith('aws-actions/configure-aws-credentials@') === true
  )
}

describe('pnpm install workflow policy', () => {
  it('passes setup-node-pnpm only install-scripts and setup-backend no inputs', () => {
    expect(setupCalls.length).toBeGreaterThan(0)
    const unexpected = setupCalls.flatMap(call =>
      Object.keys(call.step.with ?? {})
        .filter(
          input =>
            call.step.uses !== './.github/actions/setup-node-pnpm' || input !== 'install-scripts',
        )
        .map(input => `${callerId(call)}: ${input}`),
    )
    expect(unexpected).toEqual([])
  })

  it('keeps dependency setup ahead of explicit credential-bearing steps', () => {
    const violations = setupCalls.flatMap(call => {
      if (JSON.stringify(call.job.env ?? {}).includes('secrets.'))
        return [`${callerId(call)}: job-level secret environment`]
      const firstCredential = (call.job.steps ?? []).findIndex(hasExplicitCredential)
      return firstCredential !== -1 && call.stepIndex >= firstCredential ? [callerId(call)] : []
    })
    expect(violations).toEqual([])
  })

  it('passes install-scripts only as the literal opt-out', () => {
    // setup-node-pnpm treats every value except 'false' as a full install, so a typo such as
    // 'no' would silently run lifecycle scripts; 'true' is the default and is not restated.
    const invalid = setupCalls.flatMap(call =>
      call.step.with && 'install-scripts' in call.step.with
        ? call.step.with['install-scripts'] === 'false'
          ? []
          : [`${callerId(call)}: ${JSON.stringify(call.step.with['install-scripts'])}`]
        : [],
    )
    expect(invalid).toEqual([])
  })

  it('keeps control-plane-only installs script-free', () => {
    expect(
      setupCalls
        .filter(call => call.step.with?.['install-scripts'] === 'false')
        .map(callerId)
        .toSorted(),
    ).toEqual([...scriptFreeInstallCallers].toSorted())
  })

  it('keeps pnpm install owned by setup-node-pnpm', () => {
    // setup-node-pnpm owns the single frozen-lockfile install and the pnpm store cache, so every
    // other workflow job and composite action delegates to it.
    const directInstalls = stepLists.flatMap(({ owner, steps }) =>
      owner === '.github/actions/setup-node-pnpm/action.yml'
        ? []
        : steps.flatMap(step => {
            const command = step.with?.command
            const bodies = [step.run, typeof command === 'string' ? command : undefined]
            return bodies.some(runsPnpmInstall) ? [owner] : []
          }),
    )
    expect(directInstalls).toEqual([])

    expect([
      runsPnpmInstall('timeout 120 pnpm install --frozen-lockfile'),
      runsPnpmInstall('CI=1 pnpm \\\n  install --frozen-lockfile'),
      runsPnpmInstall('pnpm --dir package install'),
      runsPnpmInstall('pnpm --config.foo=bar install'),
      runsPnpmInstall('pnpm -C package i'),
      runsPnpmInstall('# pnpm install is documented, not executed'),
      runsPnpmInstall('pnpm exec playwright install chromium'),
      runsPnpmInstall('pnpm --filter web exec playwright install'),
    ]).toEqual([true, true, true, true, true, false, false, false])
  })
})
