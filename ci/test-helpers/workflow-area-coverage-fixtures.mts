import { stringify } from 'yaml'
import type { Workflow } from '../workflow-area-coverage-model.mts'

/** A finite five-area graph; its values are independent of the policy implementation. */
export function areaCoverageDocuments(): Record<string, Workflow> {
  const documents: Record<string, Workflow> = {}
  for (const area of ['backend', 'cloudflare-worker', 'lambdas', 'tooling', 'web']) {
    documents[`.github/workflows/${area}.yml`] = {
      jobs: {
        first: { uses: `./.github/workflows/tests-${area}.yml`, with: { publish_coverage: true } },
        second: { uses: `./.github/workflows/tests-${area}.yml`, with: { publish_coverage: true } },
        coverage: {
          uses: './.github/workflows/ci-area-coverage.yml',
          with: { area },
          needs: ['first', 'second'],
          if: "!cancelled() && github.event_name == 'pull_request'",
        },
        codecov: {
          uses: './.github/workflows/ci-upload-codecov.yml',
          with: { uploads: JSON.stringify([{ flag: area, pattern: `lcov-full-${area}*` }]) },
          needs: ['first', 'second', 'changes'],
          permissions: { 'id-token': 'write' },
          if:
            area === 'tooling'
              ? "!cancelled() && needs.changes.outputs.area-tooling == 'true'"
              : "!cancelled() && (needs.first.result == 'success' || needs.second.result == 'success')",
        },
        [area]: {
          needs: ['coverage'],
          steps: [
            {
              uses: `vouchington/vouchington-tooling/.github/actions/ci-required-result-gate@${'1'.repeat(40)}`,
            },
          ],
        },
      },
    }
    documents[`.github/workflows/tests-${area}.yml`] = {
      jobs: {
        suite: {
          steps: [
            {
              uses: `vouchington/vouchington-tooling/.github/actions/upload-full-lcov@${'1'.repeat(40)}`,
              if: '${{ inputs.publish_coverage }}',
              with: { suite: area },
            },
            {
              uses: `vouchington/vouchington-tooling/.github/actions/upload-full-lcov@${'1'.repeat(40)}`,
              if: "${{ inputs.publish_coverage && steps.upload.outcome == 'failure' }}",
              with: { suite: area, 'name-suffix': '-retry' },
            },
            { env: { FAMILY: 'full-lcov', SUITE: area }, if: '${{ inputs.publish_coverage }}' },
          ],
        },
      },
    }
  }
  documents['.github/workflows/ci-area-coverage.yml'] = {
    jobs: {
      coverage: {
        permissions: { actions: 'read', contents: 'read' },
        steps: [{ run: './ci/coverage-artifacts.sh area-check' }],
      },
    },
  }
  documents['.github/workflows/ci-upload-codecov.yml'] = {
    jobs: {
      'upload-codecov': {
        permissions: { 'id-token': 'write' },
        'continue-on-error': true,
        steps: [
          { uses: `actions/checkout@${'1'.repeat(40)}`, with: { 'persist-credentials': false } },
          {
            uses: `codecov/codecov-action@${'1'.repeat(40)}`,
            with: { flags: '${{ matrix.flag }}', use_oidc: true },
          },
        ],
      },
    },
  }
  return documents
}

export function areaCoverageSources(documents = areaCoverageDocuments()): Record<string, string> {
  return Object.fromEntries(
    Object.entries(documents).map(([path, document]) => [path, stringify(document)]),
  )
}
