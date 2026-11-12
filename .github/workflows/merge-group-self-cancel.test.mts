import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = { name?: string; uses?: string; env?: Record<string, string>; run?: string }
type Job = {
  if?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  'runs-on'?: string
  steps?: Step[]
  uses?: string
  'continue-on-error'?: unknown
}
type Workflow = { jobs?: Record<string, Job> }

const read = (path: string): Workflow => load(readFileSync(path, 'utf8')) as Workflow
const needsOf = (job: Job) => [job.needs ?? []].flat()
const gateIf = "${{ !cancelled() || github.event_name == 'merge_group' }}"
const requiredGates = [
  'static',
  'backend',
  'web',
  'cloudflare-worker',
  'lambdas',
  'tooling',
  'gitleaks',
]
const areaGates = requiredGates.filter(gate => gate !== 'gitleaks')
// Jobs the gate waits on that never cancel the run: selection, fan-ins, and report-only suites.
const informational = new Set([
  'changes',
  'coverage',
  'codecov',
  'test-backend-credentialed',
  'test-playwright-credentialed',
])
// A failed static check skips every suite behind it, so the run already ends at once; the image
// validators run on pull requests only.
const exempt = (id: string, gate: string) =>
  informational.has(id) ||
  (gate !== 'static' && id.startsWith('static-')) ||
  id.startsWith('validate-')

const areas = areaGates.map(gate => {
  const jobs = read(`.github/workflows/${gate}.yml`).jobs ?? {}
  const feeding = needsOf(jobs[gate]!).filter(id => !exempt(id, gate))
  const cancels = Object.entries(jobs).filter(([id]) => id.startsWith('cancel-'))
  return { gate, jobs, feeding, cancels }
})

// Every job reachable from an area workflow through local reusable workflows.
const reachable = (job: Job): Job[] =>
  job.uses?.startsWith('./')
    ? Object.values(read(job.uses.slice(2)).jobs ?? {}).flatMap(reachable)
    : [job]

describe('merge-group self-cancel', () => {
  it('lets every required gate evaluate after a cancelled merge-group run, and only there', () => {
    expect(
      requiredGates.filter(
        gate => read(`.github/workflows/${gate}.yml`).jobs?.[gate]?.if !== gateIf,
      ),
    ).toEqual([])
  })

  it('gives every gate-feeding job a cancel job, and no other job one', () => {
    expect(areas.flatMap(({ feeding }) => feeding).length).toBeGreaterThan(15)
    for (const { gate, feeding, cancels } of areas)
      expect([gate, cancels.map(([id]) => id).toSorted()]).toEqual([
        gate,
        feeding.map(id => `cancel-${id}`).toSorted(),
      ])
  })

  it('cancels only on merge-group failure, with one checkout-free step', () => {
    const wrong = areas.flatMap(({ gate, cancels }) =>
      cancels.flatMap(([id, job]) => {
        const [step, ...rest] = job.steps ?? []
        const ok =
          needsOf(job).join() === id.slice('cancel-'.length) &&
          job.if ===
            `\${{ failure() && needs.${id.slice('cancel-'.length)}.result == 'failure' && github.event_name == 'merge_group' }}` &&
          job['runs-on'] === 'ubuntu-slim' &&
          job['continue-on-error'] === undefined &&
          rest.length === 0 &&
          step?.uses === undefined &&
          step?.env?.GH_TOKEN === '${{ github.token }}' &&
          step.env.GH_REPO === '${{ github.repository }}' &&
          step.env.RUN_ID === '${{ github.run_id }}' &&
          step.run?.includes(
            'gh api --method POST "repos/$GH_REPO/actions/runs/$RUN_ID/cancel"',
          ) === true &&
          // Only an already-finished run (HTTP 409) is a warning; a 403 or a missing gh fails.
          step.run.includes('HTTP 409') &&
          step.run.includes('exit 1')
        return ok ? [] : [`${gate}#${id}`]
      }),
    )
    expect(wrong).toEqual([])
  })

  it('grants actions: write only to the checkout-free cancel jobs', () => {
    const widened = areas.flatMap(({ gate, cancels }) =>
      cancels
        .filter(([, job]) => JSON.stringify(job.permissions) !== '{"actions":"write"}')
        .map(([id]) => `${gate}#${id}`),
    )
    expect(widened).toEqual([])
    // No other area job, and no job in a reusable workflow it calls, can write with the run token.
    const writers = areas.flatMap(({ gate, jobs }) =>
      Object.entries(jobs)
        .filter(([id]) => !id.startsWith('cancel-'))
        .flatMap(([id, job]) =>
          [job, ...reachable(job)].map(candidate => [`${gate}#${id}`, candidate] as const),
        )
        .filter(([, job]) => job.permissions?.actions === 'write')
        .map(([where]) => where),
    )
    expect(writers).toEqual([])
  })

  it('lets nightly callers pass the cancel token ceiling to the area workflows', () => {
    const nightly = read('.github/workflows/nightly.yml').jobs ?? {}
    // A caller job caps the called workflow's jobs statically, even for jobs that do not run.
    for (const gate of areaGates)
      expect([gate, nightly[gate]?.permissions?.actions]).toEqual([gate, 'write'])
  })

  it('keeps the gates independent of the cancel jobs', () => {
    expect(
      areas.filter(({ gate, jobs }) => needsOf(jobs[gate]!).some(id => id.startsWith('cancel-'))),
    ).toEqual([])
  })
})
