import type { Job, Step, Workflow } from '../workflow-area-coverage-model.mts'

type Mutation = {
  name: string
  mutate: (documents: Record<string, Workflow>) => void
  violations: string[]
}
const suite = (documents: Record<string, Workflow>): Step[] =>
  documents['.github/workflows/tests-backend.yml']!.jobs!.suite!.steps!
const uploader = (documents: Record<string, Workflow>): Job =>
  documents['.github/workflows/ci-upload-codecov.yml']!.jobs!['upload-codecov']!

export const areaUploadMutations: Mutation[] = [
  {
    name: 'retry suffix',
    mutate: d => {
      suite(d)[1]!.with!['name-suffix'] = undefined
    },
    violations: ['.github/workflows/tests-backend.yml: LCOV retry suffix matches its condition'],
  },
  {
    name: 'upload coverage condition',
    mutate: d => {
      suite(d)[0]!.if = '${{ true }}'
    },
    violations: ['.github/workflows/tests-backend.yml: LCOV upload starts with publish_coverage'],
  },
  {
    name: 'coverage-independent upload',
    mutate: d => {
      suite(d)[0]!.if = '${{ inputs.publish_coverage && coverage-stamp }}'
    },
    violations: [
      '.github/workflows/tests-backend.yml: LCOV upload is independent of coverage and cancellation',
    ],
  },
  {
    name: 'upload finalizer',
    mutate: d => {
      suite(d)[2]!.if = '${{ always() }}'
    },
    violations: [
      '.github/workflows/tests-backend.yml: LCOV finalizer uses publish_coverage for backend',
    ],
  },
  {
    name: 'blocking credentials',
    mutate: d => {
      d['.github/workflows/ci-area-coverage.yml']!.jobs!.coverage!.permissions = {
        contents: 'write',
      }
    },
    violations: ['coverage reusable: exact read-only permissions'],
  },
  {
    name: 'blocking command',
    mutate: d => {
      d['.github/workflows/ci-area-coverage.yml']!.jobs!.coverage!.steps = [{ run: 'true' }]
    },
    violations: ['coverage reusable: final step checks area artifacts'],
  },
  {
    name: 'informational status',
    mutate: d => {
      uploader(d)['continue-on-error'] = false
    },
    violations: ['Codecov reusable: upload is informational'],
  },
  {
    name: 'uploader permissions',
    mutate: d => {
      uploader(d).permissions = {}
    },
    violations: ['Codecov reusable: OIDC permission'],
  },
  {
    name: 'uploader action pin',
    mutate: d => {
      uploader(d).steps![1]!.uses = 'codecov/codecov-action@synthetic-tag'
    },
    violations: ['Codecov reusable: pinned upload action'],
  },
  {
    name: 'uploader flag input',
    mutate: d => {
      uploader(d).steps![1]!.with!.flags = 'wrong'
    },
    violations: ['Codecov reusable: per-suite flags and OIDC'],
  },
  {
    name: 'uploader OIDC input',
    mutate: d => {
      uploader(d).steps![1]!.with!.use_oidc = false
    },
    violations: ['Codecov reusable: per-suite flags and OIDC'],
  },
  {
    name: 'uploader shell steps',
    mutate: d => {
      uploader(d).steps!.push({ run: 'true' })
    },
    violations: ['Codecov reusable: no shell steps'],
  },
  {
    name: 'uploader checkout credentials',
    mutate: d => {
      uploader(d).steps![0]!.with!['persist-credentials'] = true
    },
    violations: ['Codecov reusable: checkout credentials disabled'],
  },
  {
    name: 'blocking Codecov token',
    mutate: d => {
      d['.github/workflows/ci-area-coverage.yml']!.jobs!.coverage!.steps![0]!.env = {
        CODECOV_TOKEN: 'synthetic',
      }
    },
    violations: ['coverage reusable: no Codecov token'],
  },
  {
    name: 'informational Codecov token',
    mutate: d => {
      uploader(d).steps!.push({ env: { CODECOV_TOKEN: 'synthetic' } })
    },
    violations: ['Codecov reusable: no Codecov token'],
  },
  {
    name: 'local Codecov action',
    mutate: d => {
      uploader(d).steps!.push({ uses: './.github/actions/local' })
    },
    violations: ['Codecov reusable: no local composite action'],
  },
  {
    name: 'missing LCOV finalizer',
    mutate: d => {
      suite(d).pop()
    },
    violations: [
      '.github/workflows/tests-backend.yml: LCOV finalizer uses publish_coverage for backend',
    ],
  },
]
