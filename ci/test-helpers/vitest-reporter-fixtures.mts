import { stringify } from 'yaml'

export function reporterWorkflowFixtures(): Record<string, string> {
  const entries = [
    ['tests-web.yml', 'web-tests', 'Run web tests', 'web-test-report-shard-${{ matrix.shard }}'],
    [
      'tests-backend-modules.yml',
      'backend-modules',
      'Run backend module tests',
      'backend-modules-junit',
    ],
    ['tests-tooling.yml', 'tooling', 'Run tooling tests', 'tooling-junit'],
    ['tests-ts-shared.yml', 'ts-shared', 'Run ts-shared tests', 'ts-shared-junit'],
  ]
  return Object.fromEntries(
    entries.map(([file, job, name, artifact]) => {
      const steps = [
        {
          name,
          run: 'vitest run --bail=3',
          env: { VITEST_CI_REPORTERS: 'run', VITEST_JUNIT_OUTPUT_FILE: 'test.junit.xml' },
        },
        {
          uses: `actions/upload-artifact@${'a'.repeat(40)}`,
          if: '${{ !cancelled() }}',
          'continue-on-error': true,
          'timeout-minutes': 1,
          with: {
            name: artifact,
            path: 'test.junit.xml',
            'retention-days': 1,
            'if-no-files-found': 'warn',
          },
        },
      ]
      if (file === 'tests-tooling.yml')
        steps.push({
          name: 'route',
          run: 'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project i18n-route-bounds',
          env: { VITEST_CI_REPORTERS: 'run' },
        } as (typeof steps)[number])
      return [`.github/workflows/${file}`, stringify({ jobs: { [job]: { steps } } })]
    }),
  )
}

export const reporterUploadFieldMutations = [
  ['name: web-test-report-shard-', 'name: wrong-'],
  ['if: ${{ !cancelled() }}', 'if: always()'],
  ['continue-on-error: true', 'continue-on-error: false'],
  ['timeout-minutes: 1', 'timeout-minutes: 0'],
  ['retention-days: 1', 'retention-days: 2'],
  ['if-no-files-found: warn', 'if-no-files-found: error'],
  ['path: test.junit.xml', 'path: other.junit.xml'],
  ['test.junit.xml', 'test.xml'],
] as const
