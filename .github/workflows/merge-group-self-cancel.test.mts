import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  name?: string
  if?: string
  env?: Record<string, string>
  run?: string
  'timeout-minutes'?: number
  'continue-on-error'?: unknown
  uses?: string
  with?: Record<string, unknown>
}
type Job = {
  if?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  steps?: Step[]
  uses?: string
}
type Workflow = { jobs?: Record<string, Job> }

const read = (path: string): Workflow => load(readFileSync(path, 'utf8')) as Workflow
const local = (uses: string) =>
  `.github/workflows/${uses.replace(/^\.\/\.github\/workflows\//, '')}`
const needsOf = (job: Job) => [job.needs ?? []].flat()
const gateIf = "${{ !cancelled() || github.event_name == 'merge_group' }}"
const cancelName = 'Cancel the merge-group run so the queue ejects this entry now'
const areaGates = [
  'static',
  'backend',
  'web',
  'cloudflare-worker',
  'lambdas',
  'tooling',
  'gitleaks',
]
// Area jobs that are not gate-feeding suites: fan-ins, selection, and report-only suites.
const informational = new Set([
  'changes',
  'coverage',
  'codecov',
  'test-backend-credentialed',
  'test-playwright-credentialed',
])
// Jobs that never cancel although a gate waits on them. `prepare-postgres.yml` is shared with the
// informational credentialed and live-provider callers, which must not cancel the run, so a failure
// there still waits for its sibling suites. `resolve-main-images` runs on pushes to main only.
const upstream = new Set(['prepare-postgres', 'resolve-main-images'])

const cancelStep = (job: Job) => job.steps?.filter(step => step.name === cancelName) ?? []

// Every leaf job (one with steps) reachable from an area job through local reusable workflows.
const leaves = (id: string, job: Job): Array<[string, Job]> =>
  job.uses?.startsWith('./')
    ? Object.entries(read(local(job.uses)).jobs ?? {}).flatMap(([child, inner]) =>
        leaves(child, inner),
      )
    : [[id, job]]

const areas = areaGates
  .filter(gate => gate !== 'gitleaks')
  .map(gate => ({ gate, jobs: read(`.github/workflows/${gate}.yml`).jobs ?? {} }))
const classify = (wanted: boolean) =>
  areas.flatMap(({ gate, jobs }) =>
    Object.entries(jobs).flatMap(([id, job]) => {
      if (id === gate || job.uses?.includes('ci-detect-changes')) return []
      // A failed static check skips every suite behind it, so the run already ends at once.
      const skipsSuites = (gate !== 'static' && id.startsWith('static-')) || upstream.has(id)
      const feeds = !informational.has(id) && !skipsSuites
      if (feeds !== wanted) return []
      return leaves(id, job)
        .filter(([leaf]) => !upstream.has(leaf))
        .map(([leaf, leafJob]) => ({ where: `${gate}.yml#${id} > ${leaf}`, id, leaf, leafJob }))
    }),
  )

describe('merge-group self-cancel', () => {
  it('lets every required gate evaluate after a cancelled merge-group run, and only there', () => {
    expect(
      areaGates.filter(gate => read(`.github/workflows/${gate}.yml`).jobs?.[gate]?.if !== gateIf),
    ).toEqual([])
  })

  const feeding = classify(true)

  it('finds the gate-feeding suites', () => {
    expect(feeding.length).toBeGreaterThan(20)
  })

  it('gives every gate-feeding job one final self-cancel step that runs on merge-group failure', () => {
    const wrong = feeding.flatMap(({ where, leafJob }) => {
      const steps = leafJob.steps ?? []
      const [step] = cancelStep(leafJob)
      const ok =
        cancelStep(leafJob).length === 1 &&
        steps.at(-1) === step &&
        step?.if === "${{ failure() && github.event_name == 'merge_group' }}" &&
        step['continue-on-error'] === undefined &&
        step['timeout-minutes'] === 1 &&
        step.env?.GH_TOKEN === '${{ github.token }}' &&
        step.env?.GH_REPO === '${{ github.repository }}' &&
        step.env?.RUN_ID === '${{ github.run_id }}' &&
        step.run?.startsWith('gh run cancel "$RUN_ID"') === true
      return ok ? [] : [where]
    })
    expect(wrong).toEqual([])
  })

  it('grants actions: write at job level, or inherits it from the merge-group caller', () => {
    const explicit = feeding.filter(({ leafJob }) => leafJob.permissions)
    expect(explicit.filter(({ leafJob }) => leafJob.permissions?.actions !== 'write')).toEqual([])
    // The image publishers' build jobs inherit the caller envelope, so only the caller grants it.
    for (const [area, id] of [
      ['backend', 'publish-backend-images'],
      ['web', 'publish-web-images'],
    ] as const)
      expect(read(`.github/workflows/${area}.yml`).jobs?.[id]?.permissions?.actions).toBe('write')
  })

  it('keeps the write-capable token out of .git in every self-cancelling job', () => {
    const leaky = feeding.filter(({ leafJob }) =>
      (leafJob.steps ?? []).some(
        step =>
          step.uses?.startsWith('actions/checkout@') &&
          step.with?.['persist-credentials'] !== false,
      ),
    )
    expect(leaky.map(({ where }) => where)).toEqual([])
  })

  it('never cancels from an informational, setup, or shared job', () => {
    const quiet = classify(false)
    expect(quiet.length).toBeGreaterThan(0)
    expect(quiet.filter(({ leafJob }) => cancelStep(leafJob).length > 0)).toEqual([])
    const shared = [
      'prepare-postgres',
      'checks-static',
      'tests-backend-credentialed',
      'tests-playwright-credentialed',
      'ci-upload-codecov',
      'ci-area-coverage',
    ].flatMap(path => Object.values(read(`.github/workflows/${path}.yml`).jobs ?? {}))
    expect(shared.filter(job => cancelStep(job).length > 0)).toEqual([])
  })

  it('never cancels a pull-request run: the step is conditional on merge_group', () => {
    expect(
      feeding.filter(({ leafJob }) => !cancelStep(leafJob)[0]?.if?.includes("== 'merge_group'")),
    ).toEqual([])
  })

  it('keeps the gate-feeding callers able to grant the callee permissions', () => {
    const callers = areas.flatMap(({ gate, jobs }) =>
      Object.entries(jobs)
        .filter(
          ([id, job]) =>
            job.uses && !['validate-backend-images', 'validate-web-images'].includes(id),
        )
        .filter(([id, job]) => leaves(id, job).some(([, leaf]) => cancelStep(leaf).length > 0))
        .map(([id, job]) => [gate, id, job.permissions?.actions]),
    )
    expect(callers.length).toBeGreaterThan(10)
    expect(callers.filter(caller => caller[2] !== 'write')).toEqual([])
    const nightly = read('.github/workflows/nightly.yml').jobs ?? {}
    expect(areas.filter(({ gate }) => nightly[gate]?.permissions?.actions !== 'write')).toEqual([])
  })

  it('keeps each feeding job needed by its gate', () => {
    const unneeded = areas.flatMap(({ gate, jobs }) =>
      Object.entries(jobs)
        .filter(([id, job]) => id !== gate && !informational.has(id) && job.uses)
        .filter(([id]) => !needsOf(jobs[gate]!).includes(id))
        .map(([id]) => `${gate}#${id}`),
    )
    expect(unneeded).toEqual([])
  })
})
