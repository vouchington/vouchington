import { describe, expect, it } from 'vitest'

import { classifyRunner } from './runner-classification.mts'
import { makeJob } from './workflow-topology-test-fixtures.mts'

describe('classifyRunner', () => {
  it('classifies a reusable-workflow caller (no runs-on) as not-applicable', () => {
    expect(classifyRunner(makeJob({ id: '.github/workflows/ci.yml#build-backend' }))).toEqual({
      category: '—',
      rationale: '—',
    })
  })

  it('classifies a self-hosted array runs-on as "Self-hosted" with no exception rationale', () => {
    expect(
      classifyRunner(
        makeJob({
          id: '.github/workflows/ci.yml#tests',
          runsOn: ['self-hosted'],
        }),
      ),
    ).toEqual({ category: 'Self-hosted', rationale: '—' })
  })

  it('classifies a closed-set ubicloud-standard-2 exception job with its documented rationale', () => {
    expect(
      classifyRunner(
        makeJob({
          id: '.github/workflows/pnpm-dedupe.yml#dedupe',
          runsOn: 'ubicloud-standard-2',
        }),
      ),
    ).toEqual({
      category: 'Ubicloud (ephemeral)',
      rationale:
        'Creates commits; ephemeral avoids writing git identity into a persistent self-hosted workspace.',
    })
  })

  it('classifies the CodeBuild/Ubicloud conditional expression as the CodeBuild escape hatch', () => {
    const result = classifyRunner(
      makeJob({
        id: '.github/workflows/build-backend.yml#build',
        runsOn: "${{ true && 'codebuild-voucha-ci-runner' || 'ubicloud-standard-8-arm' }}",
      }),
    )

    expect(result.category).toBe('Ubicloud (ephemeral) / CodeBuild escape hatch')
    expect(result.rationale).toContain('#6681')
  })

  it('classifies a runner-group runs-on as "Runner group" with no rationale', () => {
    expect(
      classifyRunner(
        makeJob({
          id: '.github/workflows/synthetic.yml#group-only',
          runsOn: { group: 'my-runner-group' },
        }),
      ),
    ).toEqual({ category: 'Runner group', rationale: '—' })
  })

  it('throws on an unrecognized array-shaped runs-on', () => {
    expect(() =>
      classifyRunner(
        makeJob({
          id: '.github/workflows/synthetic.yml#unrecognized-array',
          runsOn: ['ubuntu-latest'],
        }),
      ),
    ).toThrow(/synthetic\.yml#unrecognized-array has an unrecognized array runs-on/)
  })

  it('throws when a ubicloud-standard-2 job has no documented exception rationale', () => {
    expect(() =>
      classifyRunner(
        makeJob({
          id: '.github/workflows/synthetic.yml#undocumented-ubicloud-2',
          runsOn: 'ubicloud-standard-2',
        }),
      ),
    ).toThrow(
      /synthetic\.yml#undocumented-ubicloud-2 runs on ubicloud-standard-2 but has no documented exception rationale/,
    )
  })

  it('throws on an unrecognized string runs-on', () => {
    expect(() =>
      classifyRunner(
        makeJob({
          id: '.github/workflows/synthetic.yml#unrecognized-string',
          runsOn: 'ubuntu-latest',
        }),
      ),
    ).toThrow(/synthetic\.yml#unrecognized-string has an unrecognized runs-on value/)
  })

  it('throws when a codebuild- runner is mixed with an unrecognized Ubicloud fallback', () => {
    expect(() =>
      classifyRunner(
        makeJob({
          id: '.github/workflows/synthetic.yml#malformed-codebuild',
          runsOn: "${{ true && 'codebuild-voucha-ci-runner' || 'ubicloud-standard-2' }}",
        }),
      ),
    ).toThrow(
      /synthetic\.yml#malformed-codebuild mixes a codebuild- runner with an unrecognized Ubicloud fallback/,
    )
  })
})
