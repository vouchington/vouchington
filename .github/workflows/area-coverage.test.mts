import { readdirSync, readFileSync } from 'node:fs'

import picomatch from 'picomatch'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  env?: Record<string, unknown>
  id?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}
type Job = {
  if?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  steps?: Step[]
  uses?: string
  with?: Record<string, unknown>
}
type Workflow = { jobs?: Record<string, Job> }
type Upload = { flag: string; pattern: string }

const workflowsDir = '.github/workflows'
const areaCoverageWorkflow = './.github/workflows/ci-area-coverage.yml'
const codecovWorkflow = './.github/workflows/ci-upload-codecov.yml'
const resultGateAction = 'vouchington/vouchington-tooling/.github/actions/ci-required-result-gate@'

const read = (path: string): string => readFileSync(path, 'utf8')
const readWorkflow = (path: string): Workflow => load(read(path)) as Workflow
const needsOf = (job: Job): string[] => [job.needs ?? []].flat()

const fullLcovUploads = (reusable: string): Step[] =>
  Object.values(readWorkflow(reusable).jobs ?? {}).flatMap(job =>
    (job.steps ?? []).filter(step => step.uses === './.github/actions/upload-full-lcov'),
  )

// The artifact names a reusable test workflow uploads as full LCOV (first attempt and suffixed
// retry), with matrix expressions sampled.
function fullLcovArtifacts(reusable: string): string[] {
  const names = fullLcovUploads(reusable).map(
    step => `lcov-full-${String(step.with?.suite)}${String(step.with?.['name-suffix'] ?? '')}`,
  )
  return [...new Set(names)].map(name => name.replace(/\$\{\{[^}]*\}\}/g, '1'))
}

function areaWorkflows(): Array<{ area: string; path: string; jobs: Record<string, Job> }> {
  return readdirSync(workflowsDir)
    .filter(file => file.endsWith('.yml'))
    .map(file => ({ file, jobs: readWorkflow(`${workflowsDir}/${file}`).jobs ?? {} }))
    .filter(({ jobs }) => Object.values(jobs).some(job => job.uses === areaCoverageWorkflow))
    .map(({ file, jobs }) => ({
      area: file.replace(/\.yml$/, ''),
      path: `${workflowsDir}/${file}`,
      jobs,
    }))
}

// How many upload patterns match each artifact; nightly needs exactly one per artifact.
const patternMatches = (artifacts: string[], uploads: Upload[]): Record<string, number> =>
  Object.fromEntries(
    artifacts.map(artifact => [
      artifact,
      uploads.filter(upload => picomatch.isMatch(artifact, upload.pattern)).length,
    ]),
  )
const eachOnce = (artifacts: string[]): Record<string, number> =>
  Object.fromEntries(artifacts.map(artifact => [artifact, 1]))

function jobCalling(jobs: Record<string, Job>, reusable: string): [string, Job] {
  const matches = Object.entries(jobs).filter(([, job]) => job.uses === reusable)
  expect(matches).toHaveLength(1)
  return matches[0]!
}

describe('area coverage wiring', () => {
  const areas = areaWorkflows()

  it('discovers the area workflows', () => {
    expect(areas.map(({ area }) => area).toSorted()).toEqual([
      'backend',
      'cloudflare-worker',
      'lambdas',
      'tooling',
      'web',
    ])
  })

  it.each(areas)(
    '$area checks and uploads the coverage of every suite that produces it',
    ({ area, jobs }) => {
      const producers = Object.entries(jobs).filter(
        ([, job]) =>
          job.uses?.startsWith('./.github/workflows/') &&
          fullLcovArtifacts(job.uses.slice(2)).length > 0,
      )
      const [coverageId, coverage] = jobCalling(jobs, areaCoverageWorkflow)
      const [codecovId, codecov] = jobCalling(jobs, codecovWorkflow)
      const uploads = JSON.parse(String(codecov.with?.uploads)) as Upload[]

      expect(producers.length).toBeGreaterThan(0)
      expect(coverage.with).toEqual({ area })
      const producerIds = producers.map(([id]) => id)
      expect(producers.map(([id, job]) => [id, job.with?.publish_coverage])).toEqual(
        producerIds.map(id => [id, true]),
      )
      expect(needsOf(coverage)).toEqual(expect.arrayContaining(producerIds))
      expect(needsOf(codecov).toSorted()).toEqual(producerIds.toSorted())

      // Each producer's artifacts match exactly one upload pattern, and every pattern matches.
      const artifacts = producers.flatMap(([, job]) => fullLcovArtifacts(job.uses!.slice(2)))
      expect(patternMatches(artifacts, uploads)).toEqual(eachOnce(artifacts))
      for (const upload of uploads) {
        expect(artifacts.some(artifact => picomatch.isMatch(artifact, upload.pattern))).toBe(true)
      }

      // The required area gate blocks on patch coverage but never on the informational upload.
      const gates = Object.entries(jobs).filter(([, job]) =>
        job.steps?.some(step => step.uses?.startsWith(resultGateAction)),
      )
      expect(gates.map(([id]) => id)).toEqual([area])
      expect(needsOf(gates[0]![1])).toContain(coverageId)
      expect(needsOf(gates[0]![1])).not.toContain(codecovId)

      // Only the uploader gets OIDC, and it stays eligible for fork pull requests.
      expect(codecov.permissions).toMatchObject({ 'id-token': 'write' })
      expect(codecov.if).not.toContain('trusted-secret-context')
      expect(coverage.permissions).not.toHaveProperty('id-token')
    },
  )

  // The area gate reads every suite's full LCOV on every event, so no upload may hang off the
  // pull-request-only coverage pair, and a lost upload must fail its producer.
  it('requires each full LCOV upload independently of the PR-only coverage pair', () => {
    const reusables = [
      ...new Set(
        areas.flatMap(({ jobs }) =>
          Object.values(jobs).flatMap(job => (job.uses ? [job.uses.slice(2)] : [])),
        ),
      ),
    ].filter(reusable => fullLcovUploads(reusable).length > 0)

    const uploads = reusables.flatMap(reusable =>
      fullLcovUploads(reusable).map(upload => ({
        reusable,
        condition: upload.if ?? '',
        suffix: upload.with?.['name-suffix'],
      })),
    )
    const outcomes = reusables.flatMap(reusable => {
      const steps = Object.values(readWorkflow(reusable).jobs ?? {}).flatMap(job => job.steps ?? [])
      const suites = new Set(fullLcovUploads(reusable).map(step => step.with?.suite))
      return [...suites].map(suite => ({
        reusable,
        suite,
        condition: steps.find(step => step.env?.FAMILY === 'full-lcov' && step.env?.SUITE === suite)
          ?.if,
      }))
    })

    expect(reusables.length).toBeGreaterThan(0)
    expect(uploads).toEqual(
      uploads.map(({ reusable, condition }) => ({
        reusable,
        condition: expect.stringMatching(/^\$\{\{ inputs\.publish_coverage[ }]/),
        // A retry reusing the first attempt's name would 409 on an unfinalized upload.
        suffix: condition.includes(".outcome == 'failure'") ? '-retry' : undefined,
      })),
    )
    expect(
      uploads.filter(({ condition }) =>
        /coverage-stamp|publish_coverage_pair|cancelled/.test(condition),
      ),
    ).toEqual([])
    expect(outcomes).toEqual(
      outcomes.map(outcome => ({ ...outcome, condition: '${{ inputs.publish_coverage }}' })),
    )
  })

  // nightly.yml runs every area in one workflow run, so one suite's artifacts must never match
  // another area's upload pattern.
  it('gives every suite a unique Codecov flag and pattern across areas', () => {
    const uploads = areas.flatMap(({ jobs }) => {
      const [, codecov] = jobCalling(jobs, codecovWorkflow)
      return JSON.parse(String(codecov.with?.uploads)) as Upload[]
    })
    const flags = uploads.map(upload => upload.flag)
    const artifacts = areas.flatMap(({ jobs }) =>
      Object.values(jobs).flatMap(job =>
        job.uses?.startsWith('./.github/workflows/') ? fullLcovArtifacts(job.uses.slice(2)) : [],
      ),
    )

    expect(new Set(flags).size).toBe(flags.length)
    for (const flag of flags) expect(flag).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(patternMatches(artifacts, uploads)).toEqual(eachOnce(artifacts))
  })

  it('keeps the blocking area check free of OIDC and Codecov credentials', () => {
    const source = read(`${workflowsDir}/ci-area-coverage.yml`)
    const job = readWorkflow(`${workflowsDir}/ci-area-coverage.yml`).jobs?.coverage

    expect(job?.permissions).toEqual({ actions: 'read', contents: 'read' })
    expect(job?.steps?.at(-1)?.run).toContain('./ci/coverage-artifacts.sh area-check')
    expect(source).not.toContain('CODECOV_TOKEN')
  })

  it('uploads each suite under its own flag with OIDC and only pinned external actions', () => {
    const source = read(`${workflowsDir}/ci-upload-codecov.yml`)
    const job = readWorkflow(`${workflowsDir}/ci-upload-codecov.yml`).jobs?.['upload-codecov']
    const upload = job?.steps?.find(step => step.uses?.startsWith('codecov/codecov-action@'))

    expect(job?.permissions).toMatchObject({ 'id-token': 'write' })
    expect(job).toMatchObject({ 'continue-on-error': true })
    expect(upload?.uses).toMatch(/^codecov\/codecov-action@[0-9a-f]{40}$/)
    expect(upload?.with).toMatchObject({ flags: '${{ matrix.flag }}', use_oidc: true })
    expect(job?.steps?.some(step => step.run !== undefined)).toBe(false)
    expect(source).toContain('persist-credentials: false')
    expect(source).not.toContain('./.github/actions/')
    expect(source).not.toContain('CODECOV_TOKEN')
  })
})
