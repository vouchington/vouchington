import { describe, expect, it } from 'vitest'
import { areaCoveragePolicyViolations } from '../../ci/workflow-area-coverage-policy.mts'
import {
  areaCoverageDocuments,
  areaCoverageSources,
} from '../../ci/test-helpers/workflow-area-coverage-fixtures.mts'

import { areaCoverageMutations } from '../../ci/test-helpers/workflow-area-coverage-mutations.mts'
import { areaUploadMutations } from '../../ci/test-helpers/workflow-area-coverage-upload-mutations.mts'

describe('area coverage static policy', () => {
  it('accepts the finite area graph, independent uploads and credential boundaries', () => {
    expect(areaCoveragePolicyViolations(areaCoverageSources())).toEqual([])
  })

  it.each([...areaCoverageMutations, ...areaUploadMutations])(
    'rejects $name',
    ({ mutate, violations }) => {
      const documents = areaCoverageDocuments()
      mutate(documents)
      expect(areaCoveragePolicyViolations(areaCoverageSources(documents))).toEqual(violations)
    },
  )

  it('requires all five owning areas', () => {
    const { '.github/workflows/web.yml': _web, ...documents } = areaCoverageDocuments()
    expect(areaCoveragePolicyViolations(areaCoverageSources(documents))).toEqual([
      'areas: discover exactly backend, cloudflare-worker, lambdas, tooling, web',
    ])
  })

  it('requires exactly one coverage caller', () => {
    const documents = areaCoverageDocuments()
    const jobs = documents['.github/workflows/backend.yml']!.jobs!
    jobs.extra = jobs.coverage!
    expect(areaCoveragePolicyViolations(areaCoverageSources(documents))).toEqual([
      'backend: exactly one area coverage caller',
    ])
  })

  it('requires exactly one Codecov caller', () => {
    const documents = areaCoverageDocuments()
    const jobs = documents['.github/workflows/backend.yml']!.jobs!
    jobs.extra = jobs.codecov!
    expect(areaCoveragePolicyViolations(areaCoverageSources(documents))).toEqual([
      'backend: exactly one Codecov caller',
    ])
  })

  it('requires actual LCOV producers for an area', () => {
    const documents = areaCoverageDocuments()
    documents['.github/workflows/tests-backend.yml'] = { jobs: {} }
    expect(areaCoveragePolicyViolations(areaCoverageSources(documents))).toEqual([
      'backend: at least one LCOV producer',
      'backend: every upload pattern matches an artifact',
      'backend: Codecov success clause names exactly the LCOV producers',
    ])
  })

  it('rejects unrecognized workflow YAML', () => {
    expect(areaCoveragePolicyViolations({ '.github/workflows/broken.yml': 'jobs: [' })).toEqual([
      '.github/workflows/broken.yml: invalid workflow YAML',
    ])
  })
})
