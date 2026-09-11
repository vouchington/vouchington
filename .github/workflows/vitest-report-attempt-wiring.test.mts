import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse as load } from 'yaml'

const producers = [
  'storybook.yml',
  'tests-backend-credentialed.yml',
  'tests-backend-modules.yml',
  'tests-backend-unit.yml',
  'tests-cloudflare-worker.yml',
  'tests-lambdas.yml',
  'tests-portability.yml',
  'tests-tooling.yml',
  'tests-ts-shared.yml',
  'tests-web-integration.yml',
  'tests-web-api.yml',
  'tests-web.yml',
] as const

const blobOutcomeProducers = [...producers, 'tests-postgres-schema.yml'] as const
const reportAttemptTimeoutMinutes = 1

type Step = {
  'continue-on-error'?: boolean
  env?: Record<string, string>
  id?: string
  if?: string
  name?: string
  run?: string
  'timeout-minutes'?: number
  uses?: string
  with?: Record<string, string>
}

type Workflow = {
  jobs: Record<string, { steps?: Step[] }>
}

const blobOutcomeFallbackPair =
  /FAMILY: vitest-blob\n\s+SUITE: [^\n]+\n\s+FIRST_OUTCOME: \$\{\{ steps\.(vitest-blob-fallback-\d+)\.outcome \}\}\n\s+RETRY_OUTCOME: \$\{\{ steps\.\1-retry\.outcome \}\}/g

describe('Vitest report attempt wiring', () => {
  it('persists suite-specific producer attempts', () => {
    let logicalMarkers = 0
    for (const file of producers) {
      const source = readFileSync(join('.github/workflows', file), 'utf8')
      const workflow = load(source) as Workflow
      expect(source).toContain('uses: ./.github/actions/upload-vitest-report-attempt')
      expect(source).not.toContain("outputs.blob != 'true'")
      const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? [])
      const firstAttempts = steps.filter(step => /^vitest-report-attempt-[12]$/.test(step.id ?? ''))
      const expected = file === 'storybook.yml' || file === 'tests-portability.yml' ? 2 : 1
      expect(firstAttempts).toHaveLength(expected)
      logicalMarkers += firstAttempts.length

      for (const first of firstAttempts) {
        const retry = steps.find(step => step.id === `${first.id}-retry`)
        const outcome = steps.find(step => step.id === `${first.id}-outcome`)
        expect(first.uses).toBe('./.github/actions/upload-vitest-report-attempt')
        expect((first.with?.suite ?? '').replace(/\$\{\{[^}]*\}\}/g, 'x')).not.toMatch(
          /(?:^|-)retry$/,
        )
        expect(first.if).toMatch(/^\$\{\{ always\(\) && /)
        expect(first['timeout-minutes']).toBe(reportAttemptTimeoutMinutes)
        expect(first['continue-on-error']).toBe(true)

        expect(retry?.uses).toBe(first.uses)
        expect(retry?.with).toEqual({ ...first.with, 'name-suffix': '-retry' })
        expect(retry?.if).toBe(
          first.if?.replace(/ \}\}$/, ` && steps.${first.id}.outcome == 'failure' }}`),
        )
        expect(retry?.['timeout-minutes']).toBe(reportAttemptTimeoutMinutes)
        expect(retry?.['continue-on-error']).toBe(true)

        expect(outcome?.if).toBe(first.if?.replace('always()', '!cancelled()'))
        expect(outcome?.['timeout-minutes']).toBe(reportAttemptTimeoutMinutes)
        expect(outcome?.['continue-on-error']).not.toBe(true)
        expect(outcome?.env).toEqual({
          FAMILY: 'vitest-report-attempt',
          SUITE: first.with?.suite,
          FIRST_OUTCOME: `\${{ steps.${first.id}.outcome }}`,
          RETRY_OUTCOME: `\${{ steps.${first.id}-retry.outcome }}`,
        })
        expect(outcome?.run).toBe(
          'node ci/artifact-upload-outcome.mts "$FAMILY" "$SUITE" "$FIRST_OUTCOME" "$RETRY_OUTCOME"',
        )
      }
    }
    expect(logicalMarkers).toBe(14)

    const action = readFileSync('.github/actions/upload-vitest-report-attempt/action.yml', 'utf8')
    expect(action).toContain('SUITE: ${{ inputs.suite }}')
    expect(action).toContain(
      'name: Validate suite\n      shell: bash\n      env:\n        SUITE: ${{ inputs.suite }}\n      run: |\n        case "$SUITE" in\n          retry|*-retry)\n            echo "::error::Invalid Vitest suite: must not be \\"retry\\" or end in \\"-retry\\" (reserved for this action\'s own name-suffix retry mechanism)" >&2\n            exit 1\n            ;;\n        esac',
    )
    expect(action).toContain(
      'pnpm exec vouchington vitest-report-attempt write .vitest-report-attempt "$SUITE"',
    )
    expect(action).not.toContain('write .vitest-report-attempt "${{ inputs.suite }}"')
    expect(action).toContain("ACTIONS_ARTIFACT_UPLOAD_TIMEOUT_MS: '30000'")
    for (const suite of ['web', 'integration']) expect(suite).not.toMatch(/(?:^|-)retry$/)
    for (const suite of ['retry', 'integration-retry', 'web-shard-1-retry']) {
      expect(suite).toMatch(/(?:^|-)retry$/)
    }
    expect(readFileSync('.github/workflows/tests-postgres-schema.yml', 'utf8')).not.toContain(
      "outputs.blob != 'true'",
    )
  })

  it('invokes blob-outcome with only the GitHub fallback attempts', () => {
    let invocations = 0
    for (const file of blobOutcomeProducers) {
      const source = readFileSync(join('.github/workflows', file), 'utf8')
      expect(source).not.toContain('coverage-primary')
      const matches = source.match(blobOutcomeFallbackPair) ?? []
      const declared = source.match(/FAMILY: vitest-blob/g) ?? []
      expect({ file, matches: matches.length, declared: declared.length }).toEqual({
        file,
        matches: declared.length,
        declared: declared.length,
      })
      invocations += matches.length
    }
    expect(invocations).toBe(15)
  })

  it('downloads attempt artifacts before resolving report expectations', () => {
    const source = readFileSync('.github/workflows/ci-test-coverage.yml', 'utf8')
    expect(source).toContain('pattern: vitest-report-attempt-*')
    expect(source).toContain('VITEST_REPORT_ATTEMPTS_DIR: ./vitest-report-attempts')
    expect(source).toMatch(
      /uses: \.\/\.github\/actions\/setup-node-pnpm\n\s+if: '!cancelled\(\)'[\s\S]*?name: Download Vitest report attempt markers/,
    )
  })

  it('normalizes retried attempt directories before resolving report expectations', () => {
    const source = readFileSync('.github/workflows/ci-test-coverage.yml', 'utf8')
    expect(source).toMatch(
      /name: Download Vitest report attempt markers[\s\S]*?name: Normalize retried Vitest report attempt directories\n\s+if: '!cancelled\(\)'\n\s+run: node ci\/normalize-retry-artifact-directories\.mts \.\/vitest-report-attempts\n\s+- name: Resolve expected Vitest reports/,
    )
  })
})
