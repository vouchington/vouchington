import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-web-api.yml', 'utf8')

describe('web API workflow', () => {
  it('runs API-only shards with database services and no web build', () => {
    expect(workflow).toContain('node ci/vitest/shard-total.mts test-web-api')
    expect(workflow).toContain('total: ${{ steps.shard-total.outputs.shard-total }}')
    expect(workflow).toContain('runs-on: ubuntu-latest')
    expect(workflow).toContain('postgres:')
    expect(workflow).toContain('valkey:')
    expect(workflow).toContain('uses: ./.github/actions/setup-backend')
    expect(workflow).toContain('node data-stores/psql/migrate.mts')
    expect(workflow).not.toContain('build-web-targets')
    expect(workflow).toContain('--project web-api --shard ${{ matrix.shard }}')
    expect(workflow).not.toContain('--project web-integration')
    expect(workflow).not.toContain('max-parallel')
  })

  it('keeps report uploads when coverage is disabled', () => {
    expect(workflow).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(workflow).not.toContain('--coverage')
    expect(workflow).toContain('web-api-shard-${{ matrix.shard }}')
    expect(workflow).toContain('inputs.upload_vitest_blob_artifact')
  })

  it('stamps coverage with the concrete matrix partition', () => {
    expect(workflow).toContain(
      'CI_SHARD: ${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }}',
    )
  })
})
