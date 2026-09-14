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

const ephemeralProfiles = new Map<string, string>()
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

function expectedLifecycle(call: SetupCall) {
  return ephemeralProfiles.has(callerId(call)) ? 'ephemeral' : 'persistent'
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
  it('classifies every setup-node-pnpm and setup-backend caller by runner lifecycle', () => {
    expect(setupCalls).toHaveLength(48)
    for (const call of setupCalls) {
      const lifecycle = call.step.with?.['runner-lifecycle']
      expect([callerId(call), lifecycle]).toEqual([callerId(call), expectedLifecycle(call)])
      expect(call.step.with).not.toHaveProperty('force-install')
      expect(call.step.with).not.toHaveProperty('install-extra-args')
      expect(call.step.with).not.toHaveProperty('install-filters')
      expect(call.step.with).not.toHaveProperty('extra-filters')
    }
    expect(
      setupCalls
        .filter(call => call.step.uses === './.github/actions/setup-backend')
        .map(call => [callerId(call), call.step.with?.['runner-lifecycle']]),
    ).toEqual(
      setupCalls
        .filter(call => call.step.uses === './.github/actions/setup-backend')
        .map(call => [callerId(call), 'persistent']),
    )
  })

  it('keeps workspace selectors on the declared ephemeral install profiles only', () => {
    const actual = new Map(
      setupCalls
        .filter(call => call.step.with?.['runner-lifecycle'] === 'ephemeral')
        .map(call => [callerId(call), call.step.with?.['ephemeral-workspaces']]),
    )
    expect(actual).toEqual(ephemeralProfiles)
    for (const call of setupCalls.filter(candidate => ephemeralProfiles.has(callerId(candidate)))) {
      const labels = Array.isArray(call.job['runs-on'])
        ? call.job['runs-on']
        : [call.job['runs-on'] ?? '']
      expect(labels).not.toContain('self-hosted')
    }

    for (const call of setupCalls.filter(
      candidate => candidate.step.with?.['runner-lifecycle'] === 'persistent',
    ))
      expect(call.step.with).not.toHaveProperty('ephemeral-workspaces')
  })

  it('keeps persistent dependency setup ahead of explicit credential-bearing steps', () => {
    const violations = setupCalls
      .filter(candidate => candidate.step.with?.['runner-lifecycle'] === 'persistent')
      .flatMap(call => {
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
        'node ci/pnpm-install.mts --runner-lifecycle persistent --install-scripts true',
      ),
      containsDirectInstall(
        'bash ci/pnpm-install.sh --runner-lifecycle persistent --install-scripts true',
      ),
    ]).toEqual([true, true, true, true, true, false, false, false])
  })
})
