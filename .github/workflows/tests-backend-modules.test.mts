import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-backend-modules.yml', 'utf8')

describe('backend module test workflow', () => {
  it('runs the backend module projects on ubuntu-latest', () => {
    expect(workflow).toContain('name: Backend Module Tests')
    expect(workflow).toContain('    runs-on: ubuntu-latest')
    expect(workflow).toContain('- uses: ./.github/actions/setup-backend')
    expect(workflow).toContain(
      'vitest run --bail=3 --project backend/data-stores/analytics --project backend/services/analytics --project backend-modules --project backend-no-data-mocks --project backend-test-helpers --project backend-contract-program --project backend-email-templates "${FILES[@]}"',
    )
    expect(workflow).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(workflow).not.toContain('strategy:')
    expect(workflow).not.toContain('--shard')
  })

  it('contains no service, credential, migration, database, Valkey, or worker setup', () => {
    for (const forbidden of [
      'services:',
      'id-token: write',
      'secrets:',
      'DATABASE_URL',
      'VALKEY_URL',
      'migrate.mts',
      'vitest.setup.data-stores',
      'vitest.setup.dynamic-config',
      'vitest.setup.glide-mq-workers',
    ]) {
      expect(workflow).not.toContain(forbidden)
    }
    expect(workflow).not.toMatch(/\bAWS_[A-Z_]+\b/)
    expect(workflow).not.toContain('OPENAI_API_KEY')
    expect(workflow).not.toContain('STRIPE_SECRET_KEY')
  })

  it('no longer owns backend dependency or TypeScript checks (moved to checks-static.yml)', () => {
    expect(workflow).not.toContain('Check backend dependencies')
    expect(workflow).not.toContain('Typecheck backend and email templates')
    expect(workflow).not.toContain(
      'pnpm exec depcruise --config backend/.dependency-cruiser.cjs --output-type err --cache --cache-strategy content backend',
    )
    expect(workflow).not.toContain(
      'pnpm exec tsc --noEmit --incremental --project backend/tsconfig.json && pnpm exec tsc --noEmit --project email-templates/tsconfig.json',
    )
  })

  it('never round-trips the Vite transform cache through actions/cache', () => {
    expect(workflow).not.toContain('Restore Vite transform cache')
    expect(workflow).not.toContain('Save Vite transform cache')
    expect(workflow).not.toContain('.cache/vite/vitest')
    expect(workflow).not.toContain('actions/cache')
  })

  it('publishes backend-modules coverage and Vitest blob artifacts', () => {
    expect(workflow).toContain('uses: ./.github/actions/upload-vitest-blob')
    expect(workflow).toContain(
      'run: node ci/artifact-upload-outcome.mts "$FAMILY" "$SUITE" "$FIRST_OUTCOME" "$RETRY_OUTCOME"',
    )
    expect(workflow).toContain('FIRST_OUTCOME: ${{ steps.coverage-fallback-1-1.outcome }}')
    expect(workflow).toContain('RETRY_OUTCOME: ${{ steps.coverage-fallback-2-1.outcome }}')
    expect(workflow).toContain('uses: ./.github/actions/upload-coverage-pair')
    expect(workflow).toContain('suite: backend-modules')
    expect(workflow).toContain('fallback attempt 2')
  })
})
