import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

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

function containsDirectInstall(body: string | undefined): boolean {
  if (!body) return false
  return body
    .replace(/\\\r?\n\s*/g, ' ')
    .split('\n')
    .some(line => /\bpnpm(?:\s+\S+)*\s+install\b/.test(line.replace(/#.*$/, '')))
}

describe('pnpm install workflow policy', () => {
  it('keeps every setup-node-pnpm and setup-backend caller free of lifecycle inputs', () => {
    expect(setupCalls).toHaveLength(48)
    for (const call of setupCalls) {
      const withInputs = call.step.with ?? {}
      expect(withInputs).not.toHaveProperty('runner-lifecycle')
      expect(withInputs).not.toHaveProperty('ephemeral-workspaces')
      expect(withInputs).not.toHaveProperty('force-install')
      expect(withInputs).not.toHaveProperty('install-extra-args')
      expect(withInputs).not.toHaveProperty('install-filters')
      expect(withInputs).not.toHaveProperty('extra-filters')
    }
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

  it('keeps control-plane-only installs script-free', () => {
    expect(
      setupCalls
        .filter(call => call.step.with?.['install-scripts'] === 'false')
        .map(callerId)
        .toSorted(),
    ).toEqual([...scriptFreeInstallCallers].toSorted())
  })

  it('keeps direct pnpm install ownership restricted to explicit exceptions', () => {
    const directInstalls = [...workflows].flatMap(([file, workflow]) =>
      Object.entries(workflow.jobs ?? {}).flatMap(([jobId, job]) =>
        (job.steps ?? []).flatMap(step => {
          const command = step.with?.command
          const bodies = [step.run, typeof command === 'string' ? command : undefined]
          const installs = bodies.some(containsDirectInstall)
          return installs ? [`${file}#${jobId}`] : []
        }),
      ),
    )
    // Every direct-install caller was migrated to the shared ci/pnpm-install.sh entrypoint (which
    // owns retry policy and terminal release-age classification in one place), so no explicit
    // exceptions remain.
    expect(directInstalls).toEqual([])

    expect([
      containsDirectInstall('timeout 120 pnpm install --frozen-lockfile'),
      containsDirectInstall('CI=1 pnpm \\\n  install --frozen-lockfile'),
      containsDirectInstall('pnpm --dir package install'),
      containsDirectInstall('pnpm --config.foo=bar install'),
      containsDirectInstall('pnpm -C package install'),
      containsDirectInstall('# pnpm install is documented, not executed'),
      containsDirectInstall(
        'node ci/pnpm-install.mts --runner-lifecycle ephemeral-full --install-scripts true',
      ),
      containsDirectInstall(
        'bash ci/pnpm-install.sh --runner-lifecycle ephemeral-full --install-scripts true',
      ),
    ]).toEqual([true, true, true, true, true, false, false, false])
  })
})
