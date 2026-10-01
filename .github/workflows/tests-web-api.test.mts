import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { ALLOWED_LABELS } from './runner-policy-classify.mts'

// The runner allowlist owns the versioned ARM label; read it instead of pinning a second literal.
const armLabel = ALLOWED_LABELS.find(label => label.endsWith('-arm'))
const workflow = readFileSync('.github/workflows/tests-web-api.yml', 'utf8')
const parsedWorkflow = load(workflow) as { jobs?: Record<string, { 'runs-on'?: string }> }

describe('web API workflow', () => {
  it('runs API-only shards with database services and no web build', () => {
    expect(workflow).toContain('node ci/vitest/shard-total.mts test-web-api')
    expect(workflow).toContain('total: ${{ steps.shard-total.outputs.shard-total }}')
    expect(armLabel).toBeDefined()
    expect(parsedWorkflow.jobs?.prep?.['runs-on']).toBe(armLabel)
    expect(parsedWorkflow.jobs?.['web-api-tests']?.['runs-on']).toBe(armLabel)
    expect(workflow).toContain('postgres:')
    expect(workflow).toContain('valkey:')
    expect(workflow).toContain('uses: ./.github/actions/setup-backend')
    expect(workflow).toContain('node data-stores/psql/migrate.mts')
    expect(workflow).not.toContain('build-web-targets')
    expect(workflow).toContain('--project web-api --shard ${{ matrix.shard }}')
    expect(workflow).not.toContain('--project web-integration')
    expect(workflow).not.toContain('max-parallel')
  })

  it('keeps JUnit reporting independent of coverage collection', () => {
    expect(workflow).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(workflow).not.toContain('--coverage')
    expect(workflow).toContain('web-api-shard-${{ matrix.shard }}')
    expect(workflow).toContain(
      'VITEST_JUNIT_OUTPUT_FILE: web-api-shard-${{ matrix.shard }}.junit.xml',
    )
  })

  it('publishes full LCOV for the concrete matrix partition', () => {
    expect(workflow).toContain('uses: ./.github/actions/upload-full-lcov')
    expect(workflow).toContain('suite: web-api-shard-${{ matrix.shard }}')
  })
})
